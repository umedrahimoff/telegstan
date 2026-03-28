import type { Channel, ChannelKeyword, GlobalKeyword, PrismaClient } from "@prisma/client";
import type { TelegramManager } from "@/lib/telegram";
import { getFilteredRecipients } from "@/lib/userRecipients";
import { stripMarkdown } from "@/lib/telegramFormat";
import { translateToRussian } from "@/lib/deepl";
import { logNotification } from "@/lib/notificationLog";

export type ChannelWithKeywords = Channel & { keywords: ChannelKeyword[] };
export type GlobalKw = Pick<GlobalKeyword, "id" | "text">;

export function resolveBackfillEntity(channel: Channel): string | number | null {
    if (channel.username) return channel.username;
    if (channel.telegramId && !channel.telegramId.startsWith("pending_")) {
        const n = parseInt(channel.telegramId, 10);
        if (!Number.isNaN(n)) return n;
    }
    return null;
}

type Mode =
    | { kind: "dateRange"; dateFrom: Date; dateTo: Date }
    | { kind: "limit"; limit: number };

/**
 * История сообщений канала → ChannelPost / Alert (та же логика, что POST …/backfill).
 */
export async function runChannelBackfill(
    prisma: PrismaClient,
    tg: TelegramManager,
    channel: ChannelWithKeywords,
    globalKeywords: GlobalKw[],
    mode: Mode,
    options: { sendNotifications: boolean; saveAll: boolean }
): Promise<{ totalScanned: number; totalMatches: number }> {
    const entity = resolveBackfillEntity(channel);
    if (entity === null) throw new Error("Channel has no username or telegramId");

    const useDateRange = mode.kind === "dateRange";
    const dateFrom = useDateRange ? mode.dateFrom : null;
    const dateTo = useDateRange ? mode.dateTo : null;
    const limit = mode.kind === "limit" ? Math.min(Math.max(1, mode.limit), 5000) : null;
    const useLimit = limit !== null;

    const { sendNotifications, saveAll } = options;
    const channelName = channel.name ?? channel.username ?? "Private/Group";

    let totalScanned = 0;
    let totalMatches = 0;
    let offsetDate: Date | undefined = useDateRange ? new Date(dateTo!.getTime()) : undefined;
    let remainingLimit = useLimit ? limit! : Infinity;
    let done = false;

    while (!done && remainingLimit > 0) {
        try {
            const fetchLimit = Math.min(100, remainingLimit);
            const messages = await tg.getMessages(entity, {
                offsetDate,
                limit: useDateRange ? 100 : fetchLimit,
            });

            if (!messages || messages.length === 0) break;

            for (const msg of messages) {
                const m = msg as unknown as Record<string, unknown>;
                if (m.className === "MessageEmpty" || m.className === "MessageService") continue;

                const msgDate = m.date instanceof Date ? m.date : new Date(Number(m.date ?? 0) * 1000);
                if (useDateRange && dateFrom && msgDate < dateFrom) {
                    done = true;
                    break;
                }
                if (useDateRange && dateTo && msgDate > dateTo) continue;

                let content = "";
                if (typeof m.message === "string") content = m.message;
                else if (typeof (m as { text?: string }).text === "string") content = (m as { text: string }).text;
                else if (m.media && typeof (m.media as { message?: string }).message === "string")
                    content = (m.media as { message: string }).message;
                if (!content.trim()) continue;

                totalScanned++;
                if (useLimit && limit != null && totalScanned > limit) break;

                const msgId = typeof m.id === "number" ? m.id : null;
                const postLink = channel.username
                    ? `https://t.me/${channel.username}/${msgId ?? ""}`
                    : `https://t.me/c/${channel.telegramId?.replace(/^-100/, "")}/${msgId ?? ""}`;

                const contentLower = content.toLowerCase();
                const hasChannelMatch = channel.keywords.some((k) => contentLower.includes(k.text.toLowerCase()));
                const hasGlobalMatch = globalKeywords.some((gk) => contentLower.includes(gk.text.toLowerCase()));
                const hasMatch = hasChannelMatch || hasGlobalMatch;

                if (saveAll || hasMatch) {
                    const existing =
                        msgId != null
                            ? await prisma.channelPost.findFirst({ where: { channelId: channel.id, messageId: msgId } })
                            : null;
                    if (!existing) {
                        await prisma.channelPost
                            .create({
                                data: {
                                    channelId: channel.id,
                                    content,
                                    messageId: msgId ?? undefined,
                                    postLink,
                                },
                            })
                            .catch(() => {});
                    }
                }

                for (const kw of channel.keywords.map((k) => k.text)) {
                    if (contentLower.includes(kw.toLowerCase())) {
                        totalMatches++;

                        const alert = await prisma.alert.create({
                            data: {
                                channelName,
                                channelId: channel.id,
                                content,
                                matchedWord: kw,
                                postLink,
                                source: "channel",
                            },
                        });

                        if (sendNotifications) {
                            const recipients = await getFilteredRecipients({
                                channelId: channel.id,
                                channelName,
                                matchedKeyword: kw,
                            });
                            const contentPlain = stripMarkdown(content);
                            const contentPreview = contentPlain.length > 400 ? contentPlain.slice(0, 400) + "…" : contentPlain;
                            const contentTranslated = await translateToRussian(contentPreview);
                            const notificationText = [
                                "🔔 Telegstan Backfill Alert",
                                "",
                                `📍 Source: ${channelName}`,
                                `🔑 Keyword: ${kw}`,
                                "",
                                "📝 Content:",
                                contentTranslated,
                                "",
                                postLink ? `🔗 Open post: ${postLink}` : "🔗 Private",
                            ].join("\n");
                            for (const r of recipients) {
                                try {
                                    await tg.sendMessage(r, notificationText);
                                    await logNotification({
                                        type: "channel",
                                        keyword: kw,
                                        sourceChannel: channelName,
                                        recipient: r,
                                        success: true,
                                        alertId: alert.id,
                                        contentPreview: contentTranslated,
                                        postLink,
                                    });
                                } catch (e: unknown) {
                                    const errMsg = e instanceof Error ? e.message : String(e);
                                    await logNotification({
                                        type: "channel",
                                        keyword: kw,
                                        sourceChannel: channelName,
                                        recipient: r,
                                        success: false,
                                        errorMessage: errMsg,
                                        alertId: alert.id,
                                        contentPreview: contentTranslated,
                                        postLink,
                                    });
                                }
                            }
                        }
                        break;
                    }
                }

                for (const gk of globalKeywords) {
                    if (contentLower.includes(gk.text.toLowerCase())) {
                        totalMatches++;
                        const globalPostLink = channel.username
                            ? `https://t.me/${channel.username}/${msgId ?? ""}`
                            : `https://t.me/c/${channel.telegramId?.replace(/^-100/, "")}/${msgId ?? ""}`;

                        const globalAlert = await prisma.alert.create({
                            data: {
                                channelName,
                                channelId: channel.id,
                                content,
                                matchedWord: gk.text,
                                postLink: globalPostLink,
                                source: "global",
                                globalKeywordId: gk.id,
                            },
                        });

                        if (sendNotifications) {
                            const recipients = await getFilteredRecipients({
                                channelId: channel.id,
                                channelName,
                                matchedKeyword: gk.text,
                            });
                            const contentPlain = stripMarkdown(content);
                            const contentPreview = contentPlain.length > 400 ? contentPlain.slice(0, 400) + "…" : contentPlain;
                            const contentTranslated = await translateToRussian(contentPreview);
                            const notificationText = [
                                "🔔 Telegstan Global Backfill Alert",
                                "",
                                `📍 Source: ${channelName}`,
                                `🔑 Keyword: ${gk.text}`,
                                "",
                                "📝 Content:",
                                contentTranslated,
                                "",
                                globalPostLink ? `🔗 Open post: ${globalPostLink}` : "🔗 Private",
                            ].join("\n");
                            for (const r of recipients) {
                                try {
                                    await tg.sendMessage(r, notificationText);
                                    await logNotification({
                                        type: "global",
                                        keyword: gk.text,
                                        sourceChannel: channelName,
                                        recipient: r,
                                        success: true,
                                        alertId: globalAlert.id,
                                        contentPreview: contentTranslated,
                                        postLink: globalPostLink,
                                    });
                                } catch (e: unknown) {
                                    const errMsg = e instanceof Error ? e.message : String(e);
                                    await logNotification({
                                        type: "global",
                                        keyword: gk.text,
                                        sourceChannel: channelName,
                                        recipient: r,
                                        success: false,
                                        errorMessage: errMsg,
                                        alertId: globalAlert.id,
                                        contentPreview: contentTranslated,
                                        postLink: globalPostLink,
                                    });
                                }
                            }
                        }
                        break;
                    }
                }
            }

            await new Promise((r) => setTimeout(r, 500));

            if (done) break;
            if (useLimit && limit != null && totalScanned >= limit) break;
            if (messages.length < 100) break;

            const lastMsg = messages[messages.length - 1] as { date?: Date | number };
            const lastDate = lastMsg.date instanceof Date ? lastMsg.date : new Date((lastMsg.date ?? 0) * 1000);
            offsetDate = lastDate;
            remainingLimit -= messages.length;
        } catch (e: unknown) {
            console.error("Backfill error for", channel.username ?? channel.id, e);
            break;
        }
    }

    return { totalScanned, totalMatches };
}
