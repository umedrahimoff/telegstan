import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaClient } from "@prisma/client";
import input from "input";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";

async function run() {
    console.log("🚀 Starting Telegram Auth for Telegstan...");

    if (!apiId || !apiHash) {
        console.error("❌ Error: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in .env");
        return;
    }

    const fromEnv = (process.env.TELEGRAM_AUTH_PHONE || "").trim();
    const phoneNumber = fromEnv || (await input.text("Номер Telegram в международном формате (например +79991234567): "));
    const normalized = phoneNumber.trim();
    if (!normalized.startsWith("+")) {
        console.error("❌ Номер должен начинаться с + и кода страны.");
        return;
    }

    const stringSession = new StringSession(""); // Start with empty session
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => normalized,
        password: async () => await input.text("Please enter your 2FA password (if any): "),
        phoneCode: async () => await input.text("Please enter the code you received in Telegram: "),
        onError: (err: any) => console.log(err),
    });

    console.log("✅ Successfully authenticated!");
    const sessionStr = client.session.save() as unknown as string;

    // Одна активная сессия (как у auth:qr) — иначе findFirst в воркере/API неоднозначен
    await prisma.session.deleteMany({});
    await prisma.session.create({
        data: { phoneNumber: normalized, sessionStr, isActive: true },
    });

    console.log("💾 Session saved to database. Your Telegstan monitor is now ready to start!");
    process.exit(0);
}

run().catch(async (e) => {
    console.error("❌ Auth failed:", e);
    process.exit(1);
});
