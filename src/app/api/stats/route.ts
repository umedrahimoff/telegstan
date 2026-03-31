import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type Period = "all" | "24h" | "3d" | "7d" | "30d";

function getPeriodStart(period: Period): Date | null {
    const now = Date.now();
    switch (period) {
        case "24h": return new Date(now - 24 * 60 * 60 * 1000);
        case "3d": return new Date(now - 3 * 24 * 60 * 60 * 1000);
        case "7d": return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000);
        default: return null;
    }
}

export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { searchParams } = new URL(req.url);
        const period = (searchParams.get("period") || "all") as Period;
        const periodStart = getPeriodStart(period);

        const dateFilter = periodStart ? { gte: periodStart } : undefined;

        const chartFrom = periodStart || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const alerts = await prisma.alert.findMany({
            where: { createdAt: { gte: chartFrom } },
            select: { createdAt: true },
        });
        const alertsFiltered = dateFilter ? alerts.filter((a) => a.createdAt >= periodStart!) : alerts;

        const getMonday = (d: Date) => {
            const x = new Date(d);
            const day = x.getDay();
            const diff = x.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(x);
            monday.setDate(diff);
            return monday.toISOString().slice(0, 10);
        };

        const byWeek: Record<string, number> = {};
        for (const a of alertsFiltered) {
            const key = getMonday(a.createdAt);
            byWeek[key] = (byWeek[key] || 0) + 1;
        }

        const weekCount = period === "24h" ? 1 : period === "3d" || period === "7d" ? 1 : period === "30d" ? 4 : 12;
        const alertsByWeek: { week: string; count: number }[] = [];
        for (let i = weekCount - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i * 7);
            const key = getMonday(d);
            const [y, m, day] = key.split("-").map(Number);
            const start = `${day.toString().padStart(2, "0")}.${m.toString().padStart(2, "0")}`;
            const endD = new Date(y, m - 1, day + 6);
            const end = `${endD.getDate().toString().padStart(2, "0")}.${(endD.getMonth() + 1).toString().padStart(2, "0")}`;
            alertsByWeek.push({ week: `${start}–${end}`, count: byWeek[key] || 0 });
        }

        const totalPostsScanned = periodStart
            ? (await prisma.dailyScanStats.aggregate({
                where: { date: { gte: periodStart } },
                _sum: { count: true },
            }))._sum.count ?? 0
            : (await prisma.dailyScanStats.aggregate({ _sum: { count: true } }))._sum.count ?? 0;

        const uniqueKeywords = await prisma.channelKeyword.groupBy({
            by: ["text"],
            where: { isActive: true },
        });

        const alertsWithMeta = await prisma.alert.findMany({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
            select: { channelName: true, matchedWord: true, createdAt: true, source: true },
        });

        const byChannel: Record<string, number> = {};
        const byKeyword: Record<string, number> = {};
        const byDay: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        const byChannelKeyword: Record<string, Record<string, number>> = {};
        for (const a of alertsWithMeta) {
            byChannel[a.channelName] = (byChannel[a.channelName] || 0) + 1;
            byKeyword[a.matchedWord] = (byKeyword[a.matchedWord] || 0) + 1;
            bySource[a.source || "channel"] = (bySource[a.source || "channel"] || 0) + 1;
            const day = a.createdAt.toISOString().slice(0, 10);
            byDay[day] = (byDay[day] || 0) + 1;
            if (!byChannelKeyword[a.channelName]) byChannelKeyword[a.channelName] = {};
            byChannelKeyword[a.channelName][a.matchedWord] = (byChannelKeyword[a.channelName][a.matchedWord] || 0) + 1;
        }

        const alertsBySource = [
            { name: "Channel", value: bySource.channel || 0, fill: "#00A3FF" },
            { name: "Global", value: bySource.global || 0, fill: "#BF5AF2" },
        ].filter((s) => s.value > 0);

        const keywordsByChannel = Object.entries(byChannelKeyword)
            .map(([channelName, kwCounts]) => ({
                channelName,
                keywords: Object.entries(kwCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([keyword, count]) => ({ keyword, count })),
            }))
            .sort((a, b) => {
                const sumA = a.keywords.reduce((s, k) => s + k.count, 0);
                const sumB = b.keywords.reduce((s, k) => s + k.count, 0);
                return sumB - sumA;
            })
            .slice(0, 5);

        const alertsByChannel = Object.entries(byChannel)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, count }));

        const alertsByKeyword = Object.entries(byKeyword)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([keyword, count]) => ({ keyword, count }));

        const byHour: Record<string, number> = {};
        if (period === "24h") {
            for (const a of alertsWithMeta) {
                const d = new Date(a.createdAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}`;
                byHour[key] = (byHour[key] || 0) + 1;
            }
        }

        const alertsByDay: { day: string; count: number }[] = [];
        const dayCount = period === "24h" ? 24 : period === "3d" ? 3 : period === "7d" ? 7 : period === "30d" ? 30 : 14;
        if (period === "24h") {
            const now = new Date();
            for (let i = 23; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 60 * 60 * 1000);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}`;
                const label = `${String(d.getHours()).padStart(2, "0")}:00`;
                alertsByDay.push({ day: label, count: byHour[key] || 0 });
            }
        } else {
            for (let i = dayCount - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                d.setUTCHours(0, 0, 0, 0);
                const key = d.toISOString().slice(0, 10);
                const [y, m, day] = key.split("-").map(Number);
                alertsByDay.push({
                    day: `${day.toString().padStart(2, "0")}.${m.toString().padStart(2, "0")}`,
                    count: byDay[key] || 0,
                });
            }
        }

        const lastScan = await prisma.dailyScanStats.findFirst({
            orderBy: { date: "desc" },
            select: { date: true, count: true },
        });

        const totalAlertsCount = dateFilter
            ? await prisma.alert.count({ where: { createdAt: dateFilter } })
            : await prisma.alert.count();

        const matchRate = totalPostsScanned > 0 ? (totalAlertsCount / totalPostsScanned) * 100 : 0;

        const [notificationStats, totalPostsSaved, channelsAddedCount] = await Promise.all([
            prisma.notificationLog.groupBy({
                by: ["success"],
                where: dateFilter ? { createdAt: dateFilter } : undefined,
                _count: true,
            }),
            dateFilter ? prisma.channelPost.count({ where: { createdAt: dateFilter } }) : prisma.channelPost.count(),
            dateFilter ? prisma.channel.count({ where: { createdAt: dateFilter } }) : prisma.channel.count(),
        ]);
        const totalNotif = notificationStats.reduce((s, x) => s + x._count, 0);
        const successNotif = notificationStats.find((x) => x.success)?._count ?? 0;
        const deliveryRate = totalNotif > 0 ? (successNotif / totalNotif) * 100 : 100;

        let periodComparison: { current: number; previous: number; changePercent: number } | null = null;
        if (periodStart) {
            const prevStart = new Date(periodStart.getTime());
            const periodMs = Date.now() - periodStart.getTime();
            prevStart.setTime(prevStart.getTime() - periodMs);
            const [currentCount, previousCount] = await Promise.all([
                prisma.alert.count({ where: { createdAt: { gte: periodStart } } }),
                prisma.alert.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } }),
            ]);
            const changePercent = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : (currentCount > 0 ? 100 : 0);
            periodComparison = { current: currentCount, previous: previousCount, changePercent };
        }

        const stats = {
            totalAlerts: totalAlertsCount,
            activeChannels: await prisma.channel.count({ where: { isActive: true } }),
            activeKeywords: uniqueKeywords.length,
            systemHealth: "Optimal",
            totalPostsScanned,
            totalPostsSaved,
            matchRate: Math.round(matchRate * 10) / 10,
            deliveryRate: Math.round(deliveryRate * 10) / 10,
            channelsAdded: channelsAddedCount,
            periodComparison,
            alertsBySource,
            keywordsByChannel,
            recentAlerts: await prisma.alert.findMany({
                where: dateFilter ? { createdAt: dateFilter } : undefined,
                orderBy: { createdAt: "desc" },
                take: 5,
            }),
            alertsByWeek,
            alertsByChannel,
            alertsByKeyword,
            alertsByDay,
            lastScan: lastScan ? { date: lastScan.date.toISOString(), count: lastScan.count } : null,
        };
        return NextResponse.json(stats);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
