import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
    CATCH_UP_BACKFILL_KEY,
    computeGapBetweenChannelsMs,
    type CatchUpBackfillQueue,
} from "@/lib/catchUpBackfillQueue";

const DEFAULT_DATE_FROM = "2026-03-22T00:00:00.000Z";

/** GET - current catch-up queue (processed by Railway worker) */
export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const row = await prisma.appSetting.findUnique({ where: { key: CATCH_UP_BACKFILL_KEY } });
    if (!row?.value) return NextResponse.json({ queue: null });

    try {
        const q = JSON.parse(row.value) as CatchUpBackfillQueue;
        const total = q.channelIds?.length ?? 0;
        const done = q.index >= total;
        return NextResponse.json({
            queue: {
                ...q,
                totalChannels: total,
                done,
                currentChannelId: !done && q.channelIds[q.index] ? q.channelIds[q.index] : null,
            },
        });
    } catch {
        return NextResponse.json({ queue: null, error: "Invalid queue payload" }, { status: 500 });
    }
}

/**
 * POST - queue all active channels: one-by-one on worker, gap between channels ~ totalMinutes / N.
 * Historical read runs on Railway (not on Vercel).
 */
export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parserRow = await prisma.appSetting.findUnique({ where: { key: "parser_enabled" } });
    if (parserRow?.value === "false") {
        return NextResponse.json({ error: "Parser is disabled in settings" }, { status: 403 });
    }

    const existing = await prisma.appSetting.findUnique({ where: { key: CATCH_UP_BACKFILL_KEY } });
    if (existing?.value) {
        try {
            const q = JSON.parse(existing.value) as CatchUpBackfillQueue;
            if (q.index < q.channelIds.length) {
                return NextResponse.json(
                    { error: "Queue is already running. Wait until it finishes or reset it via DELETE." },
                    { status: 409 }
                );
            }
        } catch {
            await prisma.appSetting.delete({ where: { key: CATCH_UP_BACKFILL_KEY } }).catch(() => {});
        }
    }

    let body: {
        dateFrom?: string;
        dateTo?: string;
        sendNotifications?: boolean;
        saveAll?: boolean;
        totalMinutes?: number;
    } = {};
    try {
        body = await req.json().catch(() => ({}));
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const dateFrom = new Date(body.dateFrom || DEFAULT_DATE_FROM);
    const dateTo = body.dateTo ? new Date(body.dateTo) : new Date();
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime()) || dateFrom >= dateTo) {
        return NextResponse.json({ error: "Invalid dateFrom / dateTo range" }, { status: 400 });
    }

    const totalMinutes = typeof body.totalMinutes === "number" ? Math.min(120, Math.max(1, body.totalMinutes)) : 10;
    const sendNotifications = !!body.sendNotifications;
    const saveAll = body.saveAll === true;

    const channels = await prisma.channel.findMany({
        where: { isActive: true },
        select: { id: true, username: true, telegramId: true },
    });
    const channelIds = channels
        .filter((c) => c.username || (c.telegramId && !c.telegramId.startsWith("pending_")))
        .map((c) => c.id);

    if (channelIds.length === 0) {
        return NextResponse.json({ error: "No active channels with username or telegramId" }, { status: 400 });
    }

    const gapMs = computeGapBetweenChannelsMs(channelIds.length, totalMinutes);
    const now = new Date();
    const queue: CatchUpBackfillQueue = {
        channelIds,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        index: 0,
        gapMs,
        sendNotifications,
        saveAll,
        nextEligibleAt: new Date(0).toISOString(),
        startedAt: now.toISOString(),
    };

    await prisma.appSetting.upsert({
        where: { key: CATCH_UP_BACKFILL_KEY },
        create: { key: CATCH_UP_BACKFILL_KEY, value: JSON.stringify(queue) },
        update: { value: JSON.stringify(queue) },
    });

    return NextResponse.json({
        success: true,
        message:
            `${channelIds.length} channel(s) queued. Railway worker will process one-by-one with a ~${Math.round(gapMs / 1000)}s gap between channels (target ${totalMinutes} min).`,
        channelIds,
        gapMs,
        totalMinutes,
        dateFrom: queue.dateFrom,
        dateTo: queue.dateTo,
    });
}

/** DELETE - reset queue (current channel may already be partially processed) */
export async function DELETE() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.appSetting.deleteMany({ where: { key: CATCH_UP_BACKFILL_KEY } });
    return NextResponse.json({ success: true });
}
