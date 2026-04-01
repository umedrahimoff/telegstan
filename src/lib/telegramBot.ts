const TELEGRAM_BOT_API = "https://api.telegram.org";

type BotParseMode = "HTML" | "MarkdownV2";
type ChatId = string | number;
type BotReplyMarkup = Record<string, unknown>;

export function hasTelegramBotToken(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export async function sendViaTelegramBot(
    toUsername: string,
    text: string,
    parseMode?: BotParseMode
): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const chatId = `@${toUsername.replace(/^@/, "").trim()}`;
    await sendViaTelegramBotChatId(chatId, text, parseMode);
}

export async function sendViaTelegramBotChatId(
    chatId: ChatId,
    text: string,
    parseMode?: BotParseMode,
    replyMarkup?: BotReplyMarkup
): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            ...(parseMode ? { parse_mode: parseMode } : {}),
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            disable_web_page_preview: true,
        }),
    });

    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
        throw new Error(data.description || `Bot send failed (${res.status})`);
    }
}

export type TelegramBotUpdate = {
    update_id: number;
    message?: {
        message_id: number;
        text?: string;
        chat?: { id: number | string };
        from?: { id?: number | string; username?: string };
    };
};

export async function getTelegramBotUpdates(offset?: number, timeoutSec = 25): Promise<TelegramBotUpdate[]> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return [];

    const qs = new URLSearchParams({
        timeout: String(Math.max(0, Math.min(50, timeoutSec))),
        allowed_updates: JSON.stringify(["message"]),
        ...(typeof offset === "number" ? { offset: String(offset) } : {}),
    });
    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/getUpdates?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: TelegramBotUpdate[]; description?: string };
    if (!res.ok || !data.ok) {
        throw new Error(data.description || `Bot getUpdates failed (${res.status})`);
    }
    return Array.isArray(data.result) ? data.result : [];
}

export async function getTelegramBotMe(): Promise<{ id: number; username?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/getMe`);
    const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { id: number; username?: string };
        description?: string;
    };
    if (!res.ok || !data.ok || !data.result) {
        throw new Error(data.description || `Bot getMe failed (${res.status})`);
    }
    return data.result;
}

export async function getTelegramBotWebhookInfo(): Promise<{ url: string | null; pendingUpdateCount?: number }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return { url: null };

    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/getWebhookInfo`);
    const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { url?: string; pending_update_count?: number };
    };
    if (!res.ok || !data.ok || !data.result) return { url: null };
    const url = data.result.url?.trim() || null;
    return { url: url || null, pendingUpdateCount: data.result.pending_update_count };
}

export async function deleteTelegramBotWebhook(dropPending = false): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

    const qs = new URLSearchParams({
        drop_pending_updates: dropPending ? "true" : "false",
    });
    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/deleteWebhook?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
        throw new Error(data.description || `Bot deleteWebhook failed (${res.status})`);
    }
}
