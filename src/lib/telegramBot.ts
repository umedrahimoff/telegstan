const TELEGRAM_BOT_API = "https://api.telegram.org";

type BotParseMode = "HTML" | "MarkdownV2";

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
    const res = await fetch(`${TELEGRAM_BOT_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            ...(parseMode ? { parse_mode: parseMode } : {}),
            disable_web_page_preview: true,
        }),
    });

    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
        throw new Error(data.description || `Bot send failed (${res.status})`);
    }
}
