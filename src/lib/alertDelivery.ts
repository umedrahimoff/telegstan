import { hasTelegramBotToken, sendViaTelegramBot } from "./telegramBot";

type DeliveryMode = "bot" | "hybrid" | "user";

type UserSender = {
    sendMessage: (to: string, text: string, parseMode?: "html" | "md") => Promise<void>;
};

function getDeliveryMode(): DeliveryMode {
    const raw = (process.env.TELEGRAM_DELIVERY_MODE || "").trim().toLowerCase();
    if (raw === "bot" || raw === "hybrid" || raw === "user") return raw;
    return hasTelegramBotToken() ? "hybrid" : "user";
}

export async function deliverAlertMessage(
    username: string,
    text: string,
    opts?: { parseMode?: "html"; userSender?: UserSender }
): Promise<"bot" | "user"> {
    const mode = getDeliveryMode();
    const parseMode = opts?.parseMode === "html" ? "HTML" : undefined;
    const to = username.replace(/^@/, "").toLowerCase();

    if (mode !== "user") {
        try {
            await sendViaTelegramBot(to, text, parseMode);
            return "bot";
        } catch (e) {
            if (mode === "bot") throw e;
        }
    }

    if (!opts?.userSender) {
        throw new Error(`User-sender fallback is unavailable for @${to}`);
    }
    await opts.userSender.sendMessage(to, text, opts.parseMode === "html" ? "html" : undefined);
    return "user";
}
