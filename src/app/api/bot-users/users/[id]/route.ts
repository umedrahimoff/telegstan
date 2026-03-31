import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await logAction({
        action: "bot_users_edit_blocked",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "user",
        targetId: id,
        details: "PATCH blocked in bot-linked recipients",
    });
    return NextResponse.json({ error: "Editing bot-linked recipients is disabled" }, { status: 403 });
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await logAction({
        action: "bot_users_delete_blocked",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "user",
        targetId: id,
        details: "DELETE blocked in bot-linked recipients",
    });
    return NextResponse.json({ error: "Deleting bot-linked recipients is disabled" }, { status: 403 });
}
