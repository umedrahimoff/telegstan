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
    const body = (await req.json().catch(() => ({}))) as {
        action?: "approve" | "reject";
        note?: string;
    };
    const action = body.action;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
    if (action !== "approve" && action !== "reject") {
        return NextResponse.json({ error: "action must be approve|reject" }, { status: 400 });
    }

    const requestRow = await prisma.botSubscriptionRequest.findUnique({ where: { id } });
    if (!requestRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (requestRow.status !== "pending") {
        return NextResponse.json({ error: "Request is already reviewed" }, { status: 409 });
    }

    if (action === "approve") {
        const existingApproved = await prisma.botSubscriptionRequest.findFirst({
            where: {
                telegramUserId: requestRow.telegramUserId,
                status: "approved",
                id: { not: requestRow.id },
            },
        });
        if (existingApproved) {
            await prisma.botSubscriptionRequest.update({
                where: { id: existingApproved.id },
                data: {
                    status: "rejected",
                    reviewNote: "Replaced by newer approved request",
                    reviewedAt: new Date(),
                    reviewedByUserId: admin.id,
                },
            });
        }

        const username = (requestRow.telegramUsername || "").trim().replace(/^@/, "").toLowerCase();
        if (!username) {
            return NextResponse.json({ error: "User has no telegram username. Ask them to set @username and resubmit." }, { status: 400 });
        }

        const existing = await prisma.appUser.findUnique({ where: { username } });
        if (existing) {
            await prisma.appUser.update({
                where: { id: existing.id },
                data: {
                    telegramUserId: requestRow.telegramUserId,
                    telegramChatId: requestRow.chatId,
                    botLinkedAt: new Date(),
                    isActive: true,
                },
            });
        } else {
            await prisma.appUser.create({
                data: {
                    username,
                    role: "moderator",
                    isActive: true,
                    canAccessAdmin: true,
                    telegramUserId: requestRow.telegramUserId,
                    telegramChatId: requestRow.chatId,
                    botLinkedAt: new Date(),
                },
            });
        }
    }

    const updated = await prisma.botSubscriptionRequest.update({
        where: { id },
        data: {
            status: action === "approve" ? "approved" : "rejected",
            reviewNote: note,
            reviewedAt: new Date(),
            reviewedByUserId: admin.id,
        },
    });

    await logAction({
        action: action === "approve" ? "bot_subscribe_approve" : "bot_subscribe_reject",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "bot_request",
        targetId: updated.id,
        details: `${updated.telegramUsername ?? updated.telegramUserId}${note ? `: ${note}` : ""}`,
    });

    const msg =
        action === "approve"
            ? [
                  "✅ <b>TGStan subscription approved</b>",
                  "",
                  "You have been added to the notification system.",
                  "You will start receiving alerts after an admin configures your channels/keywords.",
              ].join("\n")
            : [
                  "❌ <b>TGStan subscription rejected</b>",
                  "",
                  note ? `Reason: ${note}` : "Your request was rejected by an administrator.",
              ].join("\n");

    await sendViaTelegramBotChatId(updated.chatId, msg, "HTML").catch(() => {});

    return NextResponse.json({ success: true, request: updated });
}
