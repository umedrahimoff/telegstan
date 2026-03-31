import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";
import { sendViaTelegramBotChatId } from "@/lib/telegramBot";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

    const row = await prisma.botChannelSuggestion.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    if (row.status === "reviewed") return NextResponse.json({ error: "Already reviewed" }, { status: 409 });

    const updated = await prisma.botChannelSuggestion.update({
        where: { id },
        data: {
            status: "reviewed",
            reviewNote: note,
            reviewedAt: new Date(),
            reviewedByUserId: admin.id,
        },
    });

    await logAction({
        action: "bot_channel_suggestion_review",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "bot_channel_suggestion",
        targetId: updated.id,
        details: updated.channelInput,
    });

    await sendViaTelegramBotChatId(
        updated.chatId,
        [
            "✅ Твоё предложение канала получено и отмечено администратором.",
            note ? `Комментарий: ${note}` : "",
        ]
            .filter(Boolean)
            .join("\n")
    ).catch(() => {});

    return NextResponse.json({ success: true, item: updated });
}
