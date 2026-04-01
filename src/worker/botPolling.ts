import type { PrismaClient } from "@prisma/client";
import { TelegramManager } from "../lib/telegram";
import {
    deleteTelegramBotWebhook,
    getTelegramBotMe,
    getTelegramBotUpdates,
    getTelegramBotWebhookInfo,
    hasTelegramBotToken,
    sendViaTelegramBotChatId,
} from "../lib/telegramBot";

const BOT_UPDATES_OFFSET_KEY = "bot_updates_offset";
const tg = TelegramManager.getInstance();

/**
 * Long-poll Telegram Bot API. Works without MTProto user session.
 * @param mtprotoReady — if false, admin DMs on new subscription requests are skipped (no user client).
 */
export function runBotPolling(
    prisma: PrismaClient,
    setBotChat: (username: string, chatId: string) => Promise<void>,
    mtprotoReady: boolean
): void {
    if (!hasTelegramBotToken()) return;

    void (async () => {
        try {
            const wh = await getTelegramBotWebhookInfo();
            if (wh.url) {
                console.warn(
                    `🤖 Webhook is set (${wh.url}) — getUpdates would stay empty. Clearing webhook for polling…`
                );
                await deleteTelegramBotWebhook(false);
            }
        } catch (e) {
            console.warn("Bot webhook check failed:", (e as Error).message);
        }

        try {
            const me = await getTelegramBotMe();
            await deleteTelegramBotWebhook(false);
            console.log(`🤖 Bot polling enabled for @${me.username || me.id}${mtprotoReady ? "" : " (MTProto alerts: off)"}`);
        } catch (e) {
            console.warn("Bot init failed:", (e as Error).message);
        }

        let botUpdatesOffset: number | undefined;
        const botOffsetRow = await prisma.appSetting.findUnique({ where: { key: BOT_UPDATES_OFFSET_KEY } });
        if (botOffsetRow?.value) {
            const n = parseInt(botOffsetRow.value, 10);
            if (Number.isFinite(n)) botUpdatesOffset = n;
        }

        const pollBotUpdatesOnce = async () => {
            try {
                const updates = await getTelegramBotUpdates(
                    Number.isFinite(botUpdatesOffset) ? botUpdatesOffset : undefined,
                    25
                );
                if (updates.length === 0) return;

                let nextOffset = botUpdatesOffset ?? 0;
                for (const u of updates) {
                    nextOffset = Math.max(nextOffset, u.update_id + 1);
                    const msg = u.message;
                    if (!msg?.text || !msg?.chat?.id) continue;
                    const text = msg.text.trim();
                    const chatId = String(msg.chat.id);
                    const telegramUserId = String(msg.from?.id ?? "");
                    if (!telegramUserId) continue;

                    const username = (msg.from?.username || "").trim().replace(/^@/, "").toLowerCase();
                    if (!username) {
                        await sendViaTelegramBotChatId(
                            msg.chat.id,
                            "⚠️ У тебя не задан username в Telegram. Установи username и нажми /start снова."
                        ).catch(() => {});
                        continue;
                    }

                    void setBotChat(username, chatId).catch(() => {});

                    const isAlreadySubscribed = async () => {
                        const [linkedUser, approvedRequest] = await Promise.all([
                            prisma.appUser.findFirst({
                                where: {
                                    username,
                                    isActive: true,
                                    OR: [{ telegramUserId }, { telegramChatId: chatId }],
                                },
                                select: { id: true },
                            }),
                            prisma.botSubscriptionRequest.findFirst({
                                where: { telegramUserId, status: "approved" },
                                select: { id: true },
                            }),
                        ]);
                        return Boolean(linkedUser || approvedRequest);
                    };

                    if (text.startsWith("/start")) {
                        if (await isAlreadySubscribed()) {
                            await prisma.botRegistrationState.delete({ where: { telegramUserId } }).catch(() => {});
                            await sendViaTelegramBotChatId(
                                msg.chat.id,
                                "✅ Ты уже подписан и получаешь уведомления TGStan."
                            ).catch(() => {});
                            continue;
                        }
                        const latestPendingRequest = await prisma.botSubscriptionRequest.findFirst({
                            where: { telegramUserId, status: "pending" },
                            orderBy: { requestedAt: "desc" },
                            select: { id: true },
                        });
                        if (latestPendingRequest) {
                            await sendViaTelegramBotChatId(
                                msg.chat.id,
                                "🕒 Твоя заявка уже отправлена и ожидает решения администратора."
                            ).catch(() => {});
                            continue;
                        }
                        await sendViaTelegramBotChatId(
                            msg.chat.id,
                            [
                                "👋 Добро пожаловать в TGStan.",
                                "Для доступа заполни короткую анкету.",
                                "",
                                "Введи имя:",
                            ].join("\n")
                        ).catch(() => {});
                        await prisma.botRegistrationState.upsert({
                            where: { telegramUserId },
                            create: {
                                telegramUserId,
                                telegramUsername: username,
                                chatId,
                                step: "first_name",
                            },
                            update: {
                                telegramUsername: username,
                                chatId,
                                step: "first_name",
                                firstName: null,
                                lastName: null,
                                city: null,
                                phone: null,
                                email: null,
                            },
                        });
                        console.log(`🤖 Registration started for @${username}`);
                        continue;
                    }

                    const reg = await prisma.botRegistrationState.findUnique({
                        where: { telegramUserId },
                    });

                    if (reg) {
                        const val = text.slice(0, 120).trim();
                        if (!val) continue;
                        if (reg.step === "first_name") {
                            await prisma.botRegistrationState.update({
                                where: { telegramUserId },
                                data: { firstName: val, step: "last_name", chatId, telegramUsername: username },
                            });
                            await sendViaTelegramBotChatId(msg.chat.id, "Введи фамилию:").catch(() => {});
                            continue;
                        }
                        if (reg.step === "last_name") {
                            await prisma.botRegistrationState.update({
                                where: { telegramUserId },
                                data: { lastName: val, step: "city", chatId, telegramUsername: username },
                            });
                            await sendViaTelegramBotChatId(msg.chat.id, "Введи город:").catch(() => {});
                            continue;
                        }
                        if (reg.step === "city") {
                            await prisma.botRegistrationState.update({
                                where: { telegramUserId },
                                data: { city: val, step: "phone", chatId, telegramUsername: username },
                            });
                            await sendViaTelegramBotChatId(msg.chat.id, "Введи номер телефона:").catch(() => {});
                            continue;
                        }
                        if (reg.step === "phone") {
                            await prisma.botRegistrationState.update({
                                where: { telegramUserId },
                                data: { phone: val, step: "email", chatId, telegramUsername: username },
                            });
                            await sendViaTelegramBotChatId(
                                msg.chat.id,
                                "Введи email (зарегистрированный в Stanbase):"
                            ).catch(() => {});
                            continue;
                        }
                        if (reg.step === "email") {
                            const state = await prisma.botRegistrationState.update({
                                where: { telegramUserId },
                                data: { email: val, chatId, telegramUsername: username },
                            });

                            if (await isAlreadySubscribed()) {
                                await prisma.botRegistrationState.delete({ where: { telegramUserId } }).catch(() => {});
                                await sendViaTelegramBotChatId(
                                    msg.chat.id,
                                    "✅ Ты уже подписан и получаешь уведомления TGStan."
                                ).catch(() => {});
                                continue;
                            }

                            const existingPending = await prisma.botSubscriptionRequest.findFirst({
                                where: { telegramUserId, status: "pending" },
                            });
                            if (!existingPending) {
                                const request = await prisma.botSubscriptionRequest.create({
                                    data: {
                                        telegramUserId,
                                        telegramUsername: username,
                                        chatId,
                                        firstName: state.firstName,
                                        lastName: state.lastName,
                                        city: state.city,
                                        phone: state.phone,
                                        email: state.email,
                                        status: "pending",
                                    },
                                });
                                const admins = await prisma.appUser.findMany({
                                    where: { role: "admin", isActive: true, canAccessAdmin: true },
                                    select: { username: true },
                                });
                                const adminMsg = [
                                    "🆕 TGStan: заявка на подписку (новый пользователь)",
                                    `User: @${username}`,
                                    `Имя: ${state.firstName ?? "-"}`,
                                    `Фамилия: ${state.lastName ?? "-"}`,
                                    `Город: ${state.city ?? "-"}`,
                                    `Телефон: ${state.phone ?? "-"}`,
                                    `Email (Stanbase, ручная проверка): ${state.email ?? "-"}`,
                                    `requestId: ${request.id}`,
                                    "",
                                    "Одобри/отклони в Dashboard → Bot Users.",
                                ].join("\n");
                                if (mtprotoReady) {
                                    for (const a of admins) {
                                        await tg.sendMessage(a.username, adminMsg).catch(() => {});
                                    }
                                } else {
                                    console.warn(
                                        "🤖 New bot subscription request created; admin Telegram DMs skipped (no MTProto session)."
                                    );
                                }
                            }
                            await prisma.botRegistrationState.delete({ where: { telegramUserId } }).catch(() => {});
                            await sendViaTelegramBotChatId(
                                msg.chat.id,
                                "📨 Регистрация принята. Заявка отправлена администратору, email в Stanbase будет проверен вручную."
                            ).catch(() => {});
                            continue;
                        }
                    }

                    await sendViaTelegramBotChatId(
                        msg.chat.id,
                        "Для регистрации отправь /start."
                    ).catch(() => {});
                }

                botUpdatesOffset = nextOffset;
                await prisma.appSetting.upsert({
                    where: { key: BOT_UPDATES_OFFSET_KEY },
                    create: { key: BOT_UPDATES_OFFSET_KEY, value: String(nextOffset) },
                    update: { value: String(nextOffset) },
                });
            } catch (e) {
                console.warn("Bot polling error:", (e as Error).message);
            }
        };

        const pollBotUpdatesLoop = async () => {
            while (true) {
                await pollBotUpdatesOnce();
            }
        };
        void pollBotUpdatesLoop();
    })();
}
