import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaClient } from "@prisma/client";
import input from "input";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";
const phoneNumber = "+992880016400"; // Provided by user

async function run() {
    console.log("🚀 Starting Telegram Auth for Telegstan...");

    if (!apiId || !apiHash) {
        console.error("❌ Error: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in .env");
        return;
    }

    const stringSession = new StringSession(""); // Start with empty session
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => phoneNumber,
        password: async () => await input.text("Please enter your 2FA password (if any): "),
        phoneCode: async () => await input.text("Please enter the code you received in Telegram: "),
        onError: (err: any) => console.log(err),
    });

    console.log("✅ Successfully authenticated!");
    const sessionStr = client.session.save() as unknown as string;

    // Save to DB
    await prisma.session.upsert({
        where: { phoneNumber: phoneNumber },
        update: { sessionStr: sessionStr, isActive: true },
        create: {
            phoneNumber: phoneNumber,
            sessionStr: sessionStr,
            isActive: true,
        },
    });

    console.log("💾 Session saved to database. Your Telegstan monitor is now ready to start!");
    process.exit(0);
}

run().catch(async (e) => {
    console.error("❌ Auth failed:", e);
    process.exit(1);
});
