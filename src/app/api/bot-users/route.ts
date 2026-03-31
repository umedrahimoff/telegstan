import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [requests, suggestions, users] = await Promise.all([
        prisma.botSubscriptionRequest.findMany({
            orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
            take: 300,
            include: {
                reviewedBy: { select: { id: true, username: true } },
            },
        }),
        prisma.botChannelSuggestion.findMany({
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            take: 300,
            include: {
                reviewedBy: { select: { id: true, username: true } },
            },
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

    return NextResponse.json({
        requests,
        suggestions,
        users,
    });
}
