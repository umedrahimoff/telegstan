import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { TelegramManager } from "@/lib/telegram";
import { resolveBackfillEntity, runChannelBackfill } from "@/lib/channelBackfillRun";

/** POST /api/channels/[id]/backfill — parse old messages for this channel. Body: { dateFrom?, dateTo?, limit?, sendNotifications? } */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parserRow = await prisma.appSetting.findUnique({ where: { key: "parser_enabled" } });
    if (parserRow?.value === "false") return NextResponse.json({ error: "Parser is disabled in settings" }, { status: 403 });

    const { id } = await params;
    const channel = await prisma.channel.findUnique({
        where: { id },
        include: { keywords: { where: { isActive: true } } },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    if (resolveBackfillEntity(channel) === null) {
        return NextResponse.json({ error: "Channel has no username or telegramId" }, { status: 400 });
    }

    let body: { dateFrom?: string; dateTo?: string; limit?: number; sendNotifications?: boolean; saveAll?: boolean };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const limit = typeof body.limit === "number" ? Math.min(Math.max(1, body.limit), 5000) : null;
    const dateFrom = body.dateFrom ? new Date(body.dateFrom) : null;
    const dateTo = body.dateTo ? new Date(body.dateTo) : null;
    const sendNotifications = !!body.sendNotifications;
    const saveAll = body.saveAll !== false;

    const useDateRange = dateFrom && dateTo && !isNaN(dateFrom.getTime()) && !isNaN(dateTo.getTime()) && dateFrom < dateTo;
    const useLimit = limit !== null;

    if (!useDateRange && !useLimit) {
        return NextResponse.json({ error: "Provide dateFrom+dateTo or limit (number of messages)" }, { status: 400 });
    }

    const session = await prisma.session.findFirst({ where: { isActive: true } });
    if (!session) return NextResponse.json({ error: "No active Telegram session" }, { status: 400 });

    const tg = TelegramManager.getInstance();
    await tg.initialize(session.sessionStr);

    const globalKeywords = await prisma.globalKeyword.findMany({ where: { isActive: true } });

    const mode = useDateRange
        ? { kind: "dateRange" as const, dateFrom: dateFrom!, dateTo: dateTo! }
        : { kind: "limit" as const, limit: limit! };

    const { totalScanned, totalMatches } = await runChannelBackfill(prisma, tg, channel, globalKeywords, mode, {
        sendNotifications,
        saveAll,
    });

    return NextResponse.json({
        success: true,
        totalScanned,
        totalMatches,
        channelId: channel.id,
        sendNotifications,
        saveAll,
    });
}
