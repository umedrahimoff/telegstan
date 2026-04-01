import dotenv from "dotenv";
dotenv.config();
import { TelegramManager } from "../lib/telegram";
import { getFilteredRecipients } from "../lib/userRecipients";
import { stripMarkdown } from "../lib/telegramFormat";
import { translateToRussian } from "../lib/deepl";
import { logNotification } from "../lib/notificationLog";
import { PrismaClient } from "@prisma/client";
import { utils } from "telegram";
import { CATCH_UP_BACKFILL_KEY, type CatchUpBackfillQueue } from "../lib/catchUpBackfillQueue";
import { runChannelBackfill } from "../lib/channelBackfillRun";
import { deliverAlertMessage } from "../lib/alertDelivery";
import { hasTelegramBotToken } from "../lib/telegramBot";
import { runBotPolling } from "./botPolling";

const prisma = new PrismaClient();
const tg = TelegramManager.getInstance();
let catchUpBackfillBusy = false;
const BOT_CHAT_MAP_KEY = "bot_user_chat_map";

async function startMonitoring() {
    console.log("🚀 Starting TGStan Monitor...");
    console.log(process.env.DEEPL_API_KEY ? "✅ DeepL translation enabled" : "⚠️ DEEPL_API_KEY not set — alerts will be sent without translation");
    const botTokenPresent = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
    const deliveryMode = (process.env.TELEGRAM_DELIVERY_MODE || "").trim() || "(auto)";
    console.log(`🤖 Bot token present: ${botTokenPresent ? "yes" : "no"}; delivery mode: ${deliveryMode}`);

    const botChatMap = new Map<string, string>();
    const setBotChat = async (username: string, chatId: string) => {
        botChatMap.set(username, chatId);
        const payload = JSON.stringify(Object.fromEntries(botChatMap));
        await prisma.appSetting.upsert({
            where: { key: BOT_CHAT_MAP_KEY },
            create: { key: BOT_CHAT_MAP_KEY, value: payload },
            update: { value: payload },
        });
    };

    const loadBotChatMap = async () => {
        const row = await prisma.appSetting.findUnique({ where: { key: BOT_CHAT_MAP_KEY } });
        if (!row?.value) return;
        try {
            const parsed = JSON.parse(row.value) as Record<string, string>;
            for (const [u, c] of Object.entries(parsed)) {
                if (u && c) botChatMap.set(u.toLowerCase(), String(c));
            }
        } catch {
            /* ignore invalid payload */
        }
    };
    await loadBotChatMap();

    // 1. MTProto user session (channel monitoring). Bot API polling does NOT require this.
    const session = await prisma.session.findFirst({
        where: { isActive: true },
    });

    if (!session) {
        console.error(
            "❌ No active Telegram session — MTProto channel monitoring is disabled. Re-login in Dashboard."
        );
        if (hasTelegramBotToken()) {
            void runBotPolling(prisma, setBotChat, false);
        }
        return;
    }

    // 2. Initialize Telegram Client
    await tg.initialize(session.sessionStr);
    console.log("✅ Telegram Client Connected");

    // 3. Mutable state for channels/keywords (reloadable without restart)
    const state = {
        channelMapByUsername: new Map<string, { id: string; keywords: string[] }>(),
        channelMapByTelegramId: new Map<string, { id: string; keywords: string[] }>(),
        channelIdOnlyByUsername: new Map<string, string>(),
        channelIdOnlyByTelegramId: new Map<string, string>(),
        channelIdsSaveAllPosts: new Set<string>(),
        globalKeywordsList: [] as { id: string; text: string }[],
    };

    async function loadChannelsState() {
        const channels = await prisma.channel.findMany({
            where: { isActive: true },
            include: { keywords: { where: { isActive: true } } },
        });
        const globalKeywords = await prisma.globalKeyword.findMany({
            where: { isActive: true },
        });
        state.globalKeywordsList = globalKeywords.map((gk) => ({ id: gk.id, text: gk.text.toLowerCase() }));

        state.channelMapByUsername.clear();
        state.channelMapByTelegramId.clear();
        state.channelIdOnlyByUsername.clear();
        state.channelIdOnlyByTelegramId.clear();
        state.channelIdsSaveAllPosts = new Set(channels.filter((c: { saveAllPosts?: boolean }) => c.saveAllPosts).map((c) => c.id));

        for (const ch of channels) {
            const kw = ch.keywords.map((k: { text: string }) => k.text);
            if (ch.username) {
                state.channelMapByUsername.set(ch.username.toLowerCase(), { id: ch.id, keywords: kw });
                state.channelIdOnlyByUsername.set(ch.username.toLowerCase(), ch.id);
            }
            state.channelMapByTelegramId.set(ch.telegramId, { id: ch.id, keywords: kw });
            state.channelIdOnlyByTelegramId.set(ch.telegramId, ch.id);
            const rawId = ch.telegramId.replace(/^-100/, "");
            if (rawId !== ch.telegramId) {
                state.channelMapByTelegramId.set(rawId, { id: ch.id, keywords: kw });
                state.channelIdOnlyByTelegramId.set(rawId, ch.id);
            }
            state.channelMapByTelegramId.set("-100" + rawId, { id: ch.id, keywords: kw });
            state.channelIdOnlyByTelegramId.set("-100" + rawId, ch.id);
        }
        return channels;
    }

    const channels = await loadChannelsState();

    const getChannelIdForMessage = (msg: any): string | null => {
        const peer = msg.peerId || {};
        const username = (peer.username || "").toLowerCase();
        if (username) return state.channelIdOnlyByUsername.get(username) ?? null;
        try {
            const fullId = utils.getPeerId(peer);
            const raw = String(fullId).replace(/^-100/, "");
            return state.channelIdOnlyByTelegramId.get(String(fullId))
                || state.channelIdOnlyByTelegramId.get(raw)
                || state.channelIdOnlyByTelegramId.get("-100" + raw)
                || null;
        } catch (_) {
            const chatId = msg.chatId?.toString?.() || peer.channelId?.toString?.() || peer.chatId?.toString?.();
            if (chatId) {
                const raw = chatId.replace(/^-100/, "");
                return state.channelIdOnlyByTelegramId.get(chatId)
                    || state.channelIdOnlyByTelegramId.get(raw)
                    || state.channelIdOnlyByTelegramId.get("-100" + raw)
                    || null;
            }
        }
        return null;
    };
    const totalKeywords = channels.reduce((s, c) => s + c.keywords.length, 0);
    const channelsWithKeywords = channels.filter((c) => c.keywords.length > 0);
    const chatIdsForListener: (string | number)[] = [];
    for (const ch of channels) {
        if (ch.username) chatIdsForListener.push(ch.username);
        else if (ch.telegramId && !ch.telegramId.startsWith("pending_")) {
            const num = parseInt(ch.telegramId, 10);
            if (!isNaN(num)) chatIdsForListener.push(num);
        }
    }
    console.log(`📡 Monitoring ${channels.length} channels, ${totalKeywords} channel keywords, ${state.globalKeywordsList.length} global keywords.`);
    if (channelsWithKeywords.length === 0) {
        console.warn("⚠️ No channels have keywords! Add keywords to channels in the dashboard.");
    } else {
        console.log(`   Channels with keywords: ${channelsWithKeywords.map((c) => c.name || c.username || c.id).join(", ")}`);
    }
    if (chatIdsForListener.length > 0) {
        console.log(`   Listening to chats: ${chatIdsForListener.slice(0, 5).join(", ")}${chatIdsForListener.length > 5 ? "..." : ""}`);
    }

    const getKeywordsForMessage = (msg: any): string[] => {
        const peer = msg.peerId || {};
        const username = (peer.username || "").toLowerCase();
        let entry = username ? state.channelMapByUsername.get(username) : null;
        if (!entry && peer) {
            try {
                const fullId = utils.getPeerId(peer);
                const raw = String(fullId).replace(/^-100/, "");
                entry = state.channelMapByTelegramId.get(String(fullId))
                    || state.channelMapByTelegramId.get(raw)
                    || state.channelMapByTelegramId.get("-100" + raw);
            } catch (_) {
                const chatId = msg.chatId?.toString?.() || peer.channelId?.toString?.() || peer.chatId?.toString?.();
                if (chatId) {
                    const raw = chatId.replace(/^-100/, "");
                    entry = state.channelMapByTelegramId.get(chatId)
                        || state.channelMapByTelegramId.get(raw)
                        || state.channelMapByTelegramId.get("-100" + raw);
                }
            }
        }
        return entry?.keywords ?? [];
    };

    const recordScan = () => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        prisma.dailyScanStats.upsert({
            where: { date: today },
            create: { date: today, count: 1 },
            update: { count: { increment: 1 } },
        }).catch((e) => console.warn("Failed to record scan:", e.message));
    };

    const saveEveryPost = async (msg: any) => {
        const channelId = getChannelIdForMessage(msg);
        if (!channelId || !state.channelIdsSaveAllPosts.has(channelId)) return;
        const content = msg.text ?? msg.message ?? "";
        if (!content.trim()) return;

        const peer = msg.peerId || {};
        let linkUsername: string | null = peer.username || null;
        let channelIdForLink: string | null = null;
        if (!peer.username && peer.channelId) {
            const entity = await tg.getEntityByPeer(msg.peerId);
            if (entity && (entity as any).username) linkUsername = (entity as any).username;
            channelIdForLink = peer.channelId.toString().replace(/^-100/, "");
        }

        let postLink = "";
        const messageId = msg.id;
        if (linkUsername) {
            postLink = `https://t.me/${linkUsername}/${messageId}`;
        } else if (channelIdForLink) {
            postLink = `https://t.me/c/${channelIdForLink}/${messageId}`;
        }

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (channel?.username && (!postLink || postLink.startsWith("https://t.me/c/"))) {
            postLink = `https://t.me/${channel.username}/${messageId}`;
        }

        // Save to ChannelPost
        prisma.channelPost.create({
            data: { channelId, content, messageId, postLink },
        }).catch((e) => console.warn("Failed to save post:", e.message));
        prisma.channel.update({ where: { id: channelId }, data: { lastActivityAt: new Date() } }).catch(() => {});
    };

    // 4. Setup Listener
    await tg.setupListener(getKeywordsForMessage, async (msg, keyword) => {
        const peer = msg.peerId || {};
        let channelName = peer.username || "Private/Group";
        let linkUsername: string | null = peer.username || null;
        let channelIdForLink: string | null = null;

        if (!peer.username && peer.channelId) {
            const entity = await tg.getEntityByPeer(msg.peerId);
            if (entity && (entity as any).username) {
                channelName = (entity as any).username;
                linkUsername = (entity as any).username;
            } else if (entity && (entity as any).title) {
                channelName = (entity as any).title;
            }
            channelIdForLink = peer.channelId.toString().replace(/^-100/, "");
        }

        console.log(`🔔 Match found in ${channelName}! Keyword: [${keyword}]`);

        let postLink = "";
        const messageId = msg.id;
        if (linkUsername) {
            postLink = `https://t.me/${linkUsername}/${messageId}`;
        } else if (channelIdForLink) {
            postLink = `https://t.me/c/${channelIdForLink}/${messageId}`;
        }

        const channel = await prisma.channel.findFirst({
            where: {
                isActive: true,
                OR: [
                    { username: channelName },
                    { telegramId: peer.channelId?.toString() },
                    { telegramId: "-100" + (peer.channelId?.toString() || "").replace(/^-100/, "") },
                ],
            },
        });

        if (!channel) {
            console.log(`⏭️ Skipping match from unsubscribed/paused channel: ${channelName}`);
            return;
        }

        if (!postLink && channel.username) {
            postLink = `https://t.me/${channel.username}/${messageId}`;
        } else if (postLink.startsWith("https://t.me/c/") && channel.username) {
            postLink = `https://t.me/${channel.username}/${messageId}`;
        }

        // Save Alert to DB (linked to channel when found)
        const content = msg.text ?? msg.message ?? "";
        const alert = await prisma.alert.create({
            data: {
                channelName: channelName,
                channelId: channel?.id ?? null,
                content,
                matchedWord: keyword,
                postLink: postLink,
                source: "channel",
            }
        });
        if (channel?.id) {
            prisma.channel.update({ where: { id: channel.id }, data: { lastActivityAt: new Date() } }).catch(() => {});
        }

        const recipients = await getFilteredRecipients({
            channelId: channel?.id ?? null,
            channelName,
            matchedKeyword: keyword,
        });
        const contentPlain = stripMarkdown(content);
        const contentPreview = contentPlain.length > 400 ? contentPlain.slice(0, 400) + "…" : contentPlain;
        const contentTranslated = await translateToRussian(contentPreview);
        const notificationText = [
            "🔔 TGStan Alert",
            "",
            `📍 Source: ${channelName}`,
            `🔑 Keyword: ${keyword}`,
            "",
            "📝 Content:",
            contentTranslated,
            "",
            postLink ? `🔗 Open post: ${postLink}` : "🔗 Private",
        ].join("\n");
        for (const r of recipients) {
            try {
                await deliverAlertMessage(r, notificationText, { userSender: tg, botChatId: botChatMap.get(r) });
                await logNotification({ type: "channel", keyword, sourceChannel: channelName, recipient: r, success: true, alertId: alert.id, contentPreview: contentTranslated, postLink });
            } catch (e: any) {
                console.warn(`Failed to send to @${r}:`, e);
                await logNotification({ type: "channel", keyword, sourceChannel: channelName, recipient: r, success: false, errorMessage: e?.message ?? String(e), alertId: alert.id, contentPreview: contentTranslated, postLink });
            }
        }
        console.log(`🚀 Alert sent to ${recipients.map((r) => "@" + r).join(", ")}`);
    }, recordScan, chatIdsForListener.length > 0 ? chatIdsForListener : undefined, async (msg) => {
        await saveEveryPost(msg);
        // Global keywords: check every message
        const content = (msg.text ?? msg.message ?? "").toLowerCase();
        if (!content.trim()) return;
        for (const gk of state.globalKeywordsList) {
            if (content.includes(gk.text)) {
                const peer = msg.peerId || {};
                let channelName = peer.username || "Private/Group";
                let linkUsername: string | null = peer.username || null;
                let channelIdForLink: string | null = null;
                if (!peer.username && peer.channelId) {
                    const entity = await tg.getEntityByPeer(msg.peerId);
                    if (entity && (entity as any).username) {
                        channelName = (entity as any).username;
                        linkUsername = (entity as any).username;
                    } else if (entity && (entity as any).title) channelName = (entity as any).title;
                    channelIdForLink = peer.channelId.toString().replace(/^-100/, "");
                }
                let postLink = "";
                const messageId = msg.id;
                if (linkUsername) postLink = `https://t.me/${linkUsername}/${messageId}`;
                else if (channelIdForLink) postLink = `https://t.me/c/${channelIdForLink}/${messageId}`;
                const channel = await prisma.channel.findFirst({
                    where: {
                        isActive: true,
                        OR: [
                            { username: channelName },
                            { telegramId: peer.channelId?.toString() },
                            { telegramId: "-100" + (peer.channelId?.toString() || "").replace(/^-100/, "") },
                        ],
                    },
                });
                if (channel?.username && (!postLink || postLink.startsWith("https://t.me/c/"))) {
                    postLink = `https://t.me/${channel.username}/${messageId}`;
                }
                const textContent = msg.text ?? msg.message ?? "";
                const alert = await prisma.alert.create({
                    data: {
                        channelName,
                        channelId: channel?.id ?? null,
                        content: textContent,
                        matchedWord: gk.text,
                        postLink,
                        source: "global",
                        globalKeywordId: gk.id,
                    },
                });
                const contentPlain = stripMarkdown(textContent);
                const contentPreview = contentPlain.length > 400 ? contentPlain.slice(0, 400) + "…" : contentPlain;
                const contentTranslated = await translateToRussian(contentPreview);
                const notificationText = [
                    "🔔 TGStan Global Alert",
                    "",
                    `📍 Source: ${channelName}`,
                    `🔑 Keyword: ${gk.text}`,
                    "",
                    "📝 Content:",
                    contentTranslated,
                    "",
                    postLink ? `🔗 Open post: ${postLink}` : "🔗 Private",
                ].join("\n");
                const recipients = await getFilteredRecipients({
                    channelId: channel?.id ?? null,
                    channelName,
                    matchedKeyword: gk.text,
                });
                for (const r of recipients) {
                    try {
                        await deliverAlertMessage(r, notificationText, { userSender: tg, botChatId: botChatMap.get(r) });
                        await logNotification({ type: "global", keyword: gk.text, sourceChannel: channelName, recipient: r, success: true, alertId: alert.id, contentPreview: contentTranslated, postLink });
                    } catch (e: any) {
                        console.warn(`Failed to send global alert to @${r}:`, e);
                        await logNotification({ type: "global", keyword: gk.text, sourceChannel: channelName, recipient: r, success: false, errorMessage: e?.message ?? String(e), alertId: alert.id, contentPreview: contentTranslated, postLink });
                    }
                }
                console.log(`🚀 Global alert [${gk.text}] sent to ${recipients.map((u) => "@" + u).join(", ")}`);
                break;
            }
        }
    });

    tg.startReconnectInterval?.();

    // Reload channels/keywords every 5 min (picks up new keywords, saveAllPosts changes)
    setInterval(async () => {
        try {
            await loadChannelsState();
            console.log("🔄 Channels/keywords reloaded");
        } catch (e) {
            console.warn("Failed to reload channels:", (e as Error).message);
        }
    }, 5 * 60 * 1000);

    // Очередь догона по каналам (ставится из админки; паузы между каналами — анти-flood)
    setInterval(async () => {
        if (catchUpBackfillBusy) return;
        try {
            const row = await prisma.appSetting.findUnique({ where: { key: CATCH_UP_BACKFILL_KEY } });
            if (!row?.value) return;
            const q = JSON.parse(row.value) as CatchUpBackfillQueue;
            if (!q.channelIds?.length || q.index >= q.channelIds.length) {
                await prisma.appSetting.delete({ where: { key: CATCH_UP_BACKFILL_KEY } }).catch(() => {});
                return;
            }
            if (new Date(q.nextEligibleAt).getTime() > Date.now()) return;

            catchUpBackfillBusy = true;
            const channelId = q.channelIds[q.index];
            const channel = await prisma.channel.findUnique({
                where: { id: channelId },
                include: { keywords: { where: { isActive: true } } },
            });

            const advanceQueue = async (skipChannel: boolean) => {
                q.index += 1;
                q.nextEligibleAt = new Date(Date.now() + q.gapMs).toISOString();
                if (q.index >= q.channelIds.length) {
                    await prisma.appSetting.delete({ where: { key: CATCH_UP_BACKFILL_KEY } });
                    console.log("✅ Catch-up queue finished (all channels)");
                } else {
                    await prisma.appSetting.update({
                        where: { key: CATCH_UP_BACKFILL_KEY },
                        data: { value: JSON.stringify(q) },
                    });
                }
                if (skipChannel) console.warn(`Catch-up: skipped missing channel ${channelId}`);
            };

            if (!channel) {
                await advanceQueue(true);
                return;
            }

            const globalKeywords = await prisma.globalKeyword.findMany({ where: { isActive: true } });
            const dateFrom = new Date(q.dateFrom);
            const dateTo = new Date(q.dateTo);

            console.log(
                `📥 Catch-up [${q.index + 1}/${q.channelIds.length}] ${channel.username ?? channel.id} (${dateFrom.toISOString().slice(0, 10)} … ${dateTo.toISOString().slice(0, 10)})`
            );

            const { totalScanned, totalMatches } = await runChannelBackfill(
                prisma,
                tg,
                channel,
                globalKeywords,
                { kind: "dateRange", dateFrom, dateTo },
                {
                    sendNotifications: q.sendNotifications,
                    saveAll: q.saveAll,
                    botChatIdResolver: (username) => botChatMap.get(username.toLowerCase()) ?? null,
                }
            );

            console.log(`   → scanned ${totalScanned}, matches ${totalMatches}`);
            await advanceQueue(false);
        } catch (e) {
            console.error("Catch-up queue error:", e);
            try {
                const row = await prisma.appSetting.findUnique({ where: { key: CATCH_UP_BACKFILL_KEY } });
                if (row?.value) {
                    const q = JSON.parse(row.value) as CatchUpBackfillQueue;
                    q.nextEligibleAt = new Date(Date.now() + Math.max(q.gapMs, 60_000)).toISOString();
                    await prisma.appSetting.update({
                        where: { key: CATCH_UP_BACKFILL_KEY },
                        data: { value: JSON.stringify(q) },
                    });
                }
            } catch {
                /* ignore */
            }
        } finally {
            catchUpBackfillBusy = false;
        }
    }, 20_000);

    if (hasTelegramBotToken()) {
        void runBotPolling(prisma, setBotChat, true);
    }

    console.log("🟢 Listener active. Waiting for messages...");
}

async function cleanupOldAlerts() {
    console.log("🧹 Running database cleanup...");
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

    try {
        const [deletedAlerts, deletedLogs, deletedPosts, deletedActions] = await Promise.all([
            prisma.alert.deleteMany({ where: { createdAt: { lt: threeMonthsAgo } } }),
            prisma.notificationLog.deleteMany({ where: { createdAt: { lt: threeMonthsAgo } } }),
            prisma.channelPost.deleteMany({ where: { createdAt: { lt: threeMonthsAgo } } }),
            prisma.actionLog.deleteMany({ where: { createdAt: { lt: threeMonthsAgo } } }),
        ]);
        console.log(`✅ Cleanup finished: Deleted ${deletedAlerts.count} old alerts, ${deletedLogs.count} old logs, ${deletedPosts.count} old posts, ${deletedActions.count} old actions.`);
    } catch (error) {
        console.error("❌ Cleanup failed:", error);
    }
}

// Run cleanup every 24 hours
setInterval(cleanupOldAlerts, 24 * 60 * 60 * 1000);
// Also run once on startup
cleanupOldAlerts();

startMonitoring().catch(console.error);
