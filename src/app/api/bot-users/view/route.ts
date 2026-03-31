import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { section?: string };
    const section = typeof body.section === "string" ? body.section.slice(0, 100) : "unknown";

    await logAction({
        action: "bot_users_section_view",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "bot_users_section",
        targetId: section,
        details: `section=${section}`,
    });

    return NextResponse.json({ success: true });
}
