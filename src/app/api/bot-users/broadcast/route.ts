import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendViaTelegramBotChatId } from "@/lib/telegramBot";
import { logAction } from "@/lib/actionLog";

const MAX_MESSAGE_LEN = 4096;

export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
        mode?: "all" | "selected";
        userIds?: string[];
        message?: string;
    };

    const mode = body.mode === "selected" ? "selected" : "all";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (message.length > MAX_MESSAGE_LEN) {
        return NextResponse.json({ error: `Message too long (max ${MAX_MESSAGE_LEN})` }, { status: 400 });
    }

    const where =
        mode === "selected"
            ? { id: { in: Array.isArray(body.userIds) ? body.userIds : [] }, telegramChatId: { not: null }, isActive: true }
            : { telegramChatId: { not: null }, isActive: true };

    const users = await prisma.appUser.findMany({
        where,
        select: { id: true, username: true, telegramChatId: true },
    });
    if (users.length === 0) {
        return NextResponse.json({ error: "No bot-linked users found for selected mode" }, { status: 400 });
    }

    const sent: string[] = [];
    const failed: { username: string; error: string }[] = [];

    for (const u of users) {
        const chatId = u.telegramChatId;
        if (!chatId) continue;
        try {
            await sendViaTelegramBotChatId(chatId, message);
            sent.push(u.username);
        } catch (e: unknown) {
            failed.push({
                username: u.username,
                error: e instanceof Error ? e.message : String(e),
            });
        }
        await new Promise((r) => setTimeout(r, 80));
    }

    await logAction({
        action: "bot_broadcast_send",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "bot_broadcast",
        details: `mode=${mode}; users=${users.length}; sent=${sent.length}; failed=${failed.length}`,
    });

    await prisma.botBroadcastLog.create({
        data: {
            mode,
            message,
            attemptedCount: users.length,
            sentCount: sent.length,
            failedCount: failed.length,
            recipientsJson: JSON.stringify(sent),
            failedJson: JSON.stringify(failed),
            actorId: admin.id,
            actorUsername: admin.username,
        },
    });

    return NextResponse.json({
        success: true,
        sent,
        failed,
        message:
            failed.length === 0
                ? `Sent to ${sent.length} user(s)`
                : `Sent to ${sent.length}, failed for ${failed.length}`,
    });
}
