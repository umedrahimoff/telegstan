import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "30", 10)));
        const dateFrom = searchParams.get("dateFrom") || undefined;
        const dateTo = searchParams.get("dateTo") || undefined;
        const action = searchParams.get("action")?.trim() || undefined;
        const actor = searchParams.get("actor")?.trim().replace(/^@/, "") || undefined;

        const conditions: object[] = [];

        if (dateFrom || dateTo) {
            const createdAt: { gte?: Date; lte?: Date } = {};
            if (dateFrom) createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                createdAt.lte = end;
            }
            conditions.push({ createdAt });
        }
        if (action) {
            if (action.endsWith("*")) {
                conditions.push({ action: { startsWith: action.slice(0, -1) } });
            } else {
                conditions.push({ action });
            }
        }
        if (actor) conditions.push({ actorUsername: { contains: actor, mode: "insensitive" } });

        const where = conditions.length > 0 ? { AND: conditions } : undefined;

        const [items, total] = await Promise.all([
            prisma.actionLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.actionLog.count({ where }),
        ]);

        return NextResponse.json({ items, total, page, pageSize });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch action logs" }, { status: 500 });
    }
}
