import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { deliverAlertMessage } from "@/lib/alertDelivery";

const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";

const PENDING_TEST_KEY = "pending_test_notification";
const TEST_MESSAGE = [
    "✅ <b>Telegstan Test Message</b>",
    "",
    "Notification service is working correctly.",
    "",
    "<i>Sent from Settings → Test notification</i>",
].join("\n");

const TG_MESSAGE_MAX = 4096;

function resolveOutboundMessage(body: Record<string, unknown>): { text: string; parseMode: "html" | undefined } | { error: string } {
    const raw = typeof body.message === "string" ? body.message.trim() : "";
    if (raw.length > TG_MESSAGE_MAX) {
        return { error: `Message too long (max ${TG_MESSAGE_MAX} characters)` };
    }
    if (raw.length === 0) {
        return { text: TEST_MESSAGE, parseMode: "html" };
    }
    return { text: raw, parseMode: undefined };
}

export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const outbound = resolveOutboundMessage(body);
        if ("error" in outbound) {
            return NextResponse.json({ error: outbound.error }, { status: 400 });
        }
        const usernamesRaw = body?.usernames;
        let usernames: string[] = [];
        if (Array.isArray(usernamesRaw)) {
            usernames = usernamesRaw.map((u: unknown) => String(u ?? "").trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
        } else if (typeof usernamesRaw === "string") {
            usernames = usernamesRaw.split(",").map((u) => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
        }
        if (usernames.length === 0) {
            const users = await prisma.appUser.findMany({
                where: { isActive: true },
                select: { username: true },
            });
            usernames = users.map((u) => u.username.toLowerCase());
        }
        if (usernames.length === 0) {
            return NextResponse.json({ error: "No users to send to. Add users in Users section." }, { status: 400 });
        }

        const session = await prisma.session.findFirst({ where: { isActive: true } });
        if (!session) return NextResponse.json({ error: "No active Telegram session" }, { status: 500 });

        try {
            const client = new TelegramClient(new StringSession(session.sessionStr), apiId, apiHash, { connectionRetries: 2 });
            await client.connect();

            const sent: string[] = [];
            const failed: { username: string; error: string }[] = [];

            for (const username of usernames) {
                try {
                    await deliverAlertMessage(username, outbound.text, {
                        parseMode: outbound.parseMode === "html" ? "html" : undefined,
                        userSender: {
                            sendMessage: async (to, text, parseMode) => {
                                await client.sendMessage(to, {
                                    message: text,
                                    ...(parseMode ? { parseMode } : {}),
                                });
                            },
                        },
                    });
                    sent.push(username);
                } catch (e: unknown) {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    failed.push({ username, error: errMsg });
                }
            }

            await client.disconnect();

            return NextResponse.json({
                success: true,
                sent,
                failed,
                queued: false,
                message: failed.length === 0
                    ? `Test message sent to ${sent.length} user(s)`
                    : `Sent to ${sent.length}, failed for ${failed.length}`,
            });
        } catch (connectError: unknown) {
            const errStr = connectError instanceof Error ? connectError.message : String(connectError);
            if (errStr.includes("AUTH_KEY_DUPLICATED") || errStr.includes("406")) {
                const pendingPayload = {
                    usernames,
                    createdAt: new Date().toISOString(),
                    customText: outbound.parseMode ? null : outbound.text,
                };
                await prisma.appSetting.upsert({
                    where: { key: PENDING_TEST_KEY },
                    create: { key: PENDING_TEST_KEY, value: JSON.stringify(pendingPayload) },
                    update: { value: JSON.stringify(pendingPayload) },
                });
                return NextResponse.json({
                    success: true,
                    sent: [],
                    failed: [],
                    queued: true,
                    message: "Worker is connected. Test message queued — the worker will send it within ~30 seconds.",
                });
            }
            throw connectError;
        }
    } catch (error: unknown) {
        console.error("Test notification error:", error);
        const msg = error instanceof Error ? error.message : "Failed to send test message";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
