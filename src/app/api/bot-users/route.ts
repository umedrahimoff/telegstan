import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function GET(req: NextRequest) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const pageRaw = parseInt(req.nextUrl.searchParams.get("broadcastPage") || "1", 10);
    const pageSizeRaw = parseInt(req.nextUrl.searchParams.get("broadcastPageSize") || "20", 10);
    const broadcastPage = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
    const broadcastPageSize = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 20;

    const [requests, broadcasts, broadcastsTotal, users] = await Promise.all([
        prisma.botSubscriptionRequest.findMany({
            orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
            take: 300,
            include: {
                reviewedBy: { select: { id: true, username: true } },
            },
        }),
        prisma.botBroadcastLog.findMany({
            orderBy: { createdAt: "desc" },
            skip: (broadcastPage - 1) * broadcastPageSize,
            take: broadcastPageSize,
        }),
        prisma.botBroadcastLog.count(),
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
        details: `users=${users.length}; requests=${requests.length}; broadcasts=${broadcasts.length}/${broadcastsTotal}; page=${broadcastPage}; size=${broadcastPageSize}`,
    });

    return NextResponse.json({
        requests,
        broadcasts,
        broadcastsTotal,
        broadcastsPage: broadcastPage,
        broadcastsPageSize: broadcastPageSize,
        users,
    });
}
