import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const startedAt = Date.now();
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Database check
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch (e) {
        console.error("Health check DB error:", e);
        checks.database = { status: "error" };
    }

    const healthy = Object.values(checks).every((c) => c.status === "ok");

    return NextResponse.json(
        {
            status: healthy ? "healthy" : "degraded",
            timestamp: new Date().toISOString(),
            uptime: process.uptime?.() ?? null,
            latencyMs: Date.now() - startedAt,
            checks,
        },
        { status: healthy ? 200 : 503 }
    );
}
