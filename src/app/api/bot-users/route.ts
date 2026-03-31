import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [requests, broadcasts, users] = await Promise.all([
        prisma.botSubscriptionRequest.findMany({
            orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
            take: 300,
            include: {
                reviewedBy: { select: { id: true, username: true } },
            },
        }),
        prisma.botBroadcastLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
        }),
        prisma.appUser.findMany({
            where: {
                OR: [{ telegramUserId: { not: null } }, { telegramChatId: { not: null } }],
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                username: true,
                role: true,
                isActive: true,
                canAccessAdmin: true,
                telegramUserId: true,
                telegramChatId: true,
                botLinkedAt: true,
                createdAt: true,
                lastActivityAt: true,
            },
        }),
    ]);

    await logAction({
        action: "bot_users_list_view",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "bot_users",
        details: `users=${users.length}; requests=${requests.length}; broadcasts=${broadcasts.length}`,
    });

    return NextResponse.json({
        requests,
        broadcasts,
        users,
    });
}
