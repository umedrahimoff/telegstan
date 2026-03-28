import { NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { prisma } from "@/lib/prisma";
import { getNotificationRecipients } from "@/lib/settings";
import { checkRateLimit } from "@/lib/rateLimit";

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";

export async function POST(req: Request) {
    const limit = checkRateLimit(req, "auth:request", 5, 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { error: "Too many requests. Try again later." },
            { status: 429, headers: limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : undefined }
        );
    }
    try {
        const body = await req.json().catch(() => ({}));
        const username = String(body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
        if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

        const userCount = await prisma.appUser.count();
        let user: { id: string; username: string; role: string } | null = null;

        if (userCount === 0) {
            const recipients = await getNotificationRecipients();
            const adminFromEnv = (process.env.ADMIN_USERNAME || "umedrahimoff").trim().replace(/^@/, "").toLowerCase();
            const allowed = recipients.map((r) => r.toLowerCase()).includes(username) || (adminFromEnv && username === adminFromEnv);
            if (allowed) {
                user = await prisma.appUser.findFirst({ where: { username } });
                if (!user) {
                    const created = await prisma.appUser.create({
                        data: { username, role: "admin" },
                    });
                    user = created;
                }
            }
        } else {
            user = await prisma.appUser.findFirst({
                where: { username, isActive: true, canAccessAdmin: true },
            });
        }

        const genericMessage = "If the account exists, a code was sent to your Telegram.";

        if (!user) {
            return NextResponse.json({ success: true, message: genericMessage });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await prisma.verificationCode.create({
            data: { code, expiresAt, targetUserId: user.id },
        });

        const session = await prisma.session.findFirst({ where: { isActive: true } });
        if (!session) return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 500 });

        const client = new TelegramClient(new StringSession(session.sessionStr), apiId, apiHash, {
            connectionRetries: 1,
        });

        await client.connect();
        const loginMsg = [
            "🔐 <b>Telegstan Login Code</b>",
            "",
            `Your code is: <code>${code}</code>`,
            "",
            "<i>Expires in 5 minutes.</i>",
        ].join("\n");
        try {
            await client.sendMessage(username, { message: loginMsg, parseMode: "html" });
        } catch (e) {
            console.warn(`Failed to send code to @${username}:`, e);
            await client.disconnect();
            return NextResponse.json({ error: "Failed to send code. Try again later." }, { status: 500 });
        }
        await client.disconnect();

        return NextResponse.json({ success: true, message: genericMessage });
    } catch (error: any) {
        console.error("Auth Request Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
