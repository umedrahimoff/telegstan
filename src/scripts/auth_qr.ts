import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaClient } from "@prisma/client";
// @ts-expect-error - no types for qrcode-terminal
import * as qrcode from "qrcode-terminal";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";
const phoneNumber = "qr_session"; // placeholder for DB

async function run() {
    console.log("🚀 Telegram Auth via QR Code for Telegstan...\n");

    if (!apiId || !apiHash) {
        console.error("❌ TELEGRAM_API_ID or TELEGRAM_API_HASH missing in .env");
        return;
    }

    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.connect();

    const user = await client.signInUserWithQrCode(
        { apiId, apiHash },
        {
            qrCode: async (qr) => {
                const url = `tg://login?token=${qr.token.toString("base64url")}`;
                console.log("📱 Scan QR with Telegram (Settings → Devices → Link Desktop Device):\n");
                qrcode.generate(url, { small: true });
                console.log("\nOr open:", url);
                console.log("\n⏳ Waiting for scan... (QR expires in", Math.floor(qr.expires / 60), "min)\n");
            },
            onError: async (err) => {
                console.error("Auth error:", err.message);
                return false;
            },
            password: async (hint) => {
                const readline = await import("readline");
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                return new Promise((resolve) => {
                    rl.question(`2FA password${hint ? ` (hint: ${hint})` : ""}: `, (answer) => {
                        rl.close();
                        resolve(answer);
                    });
                });
            },
        }
    );

    const u = user as { username?: string; firstName?: string };
    console.log("✅ Authenticated as", u.username || u.firstName || "User");

    const sessionStr = client.session.save() as unknown as string;
    await client.disconnect();

    await prisma.session.deleteMany({});
    await prisma.session.create({
        data: { phoneNumber: "telegstan_qr", sessionStr, isActive: true },
    });

    console.log("💾 Session saved. Worker is ready to start!");
    process.exit(0);
}

run().catch((e) => {
    console.error("❌ Auth failed:", e);
    process.exit(1);
});
