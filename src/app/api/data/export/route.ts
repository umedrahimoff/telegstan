import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function escapeCsv(val: string): string {
    const s = String(val ?? "").replace(/"/g, '""');
    return `"${s}"`;
}

export async function GET() {
    try {
        const admin = await requireAdmin();
        if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const posts = await prisma.channelPost.findMany({
            orderBy: { createdAt: "desc" },
            include: { channel: { select: { name: true, username: true } } },
        });

        const header = "channel,username,content,postLink,createdAt\n";
        const rows = posts.map((p) =>
            [
                escapeCsv(p.channel.name ?? ""),
                escapeCsv(p.channel.username ?? ""),
                escapeCsv(p.content),
                escapeCsv(p.postLink ?? ""),
                p.createdAt.toISOString(),
            ].join(",")
        );
        const csv = header + rows.join("\n");
        const buf = Buffer.from(csv, "utf-8");

        return new NextResponse(buf, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="tgstan-posts-${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (e) {
        console.error("Export error:", e);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}
