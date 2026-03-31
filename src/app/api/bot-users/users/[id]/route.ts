import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const user = await prisma.appUser.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role === "admin") return NextResponse.json({ error: "Cannot modify admin" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { action?: "freeze" | "unfreeze" };
    if (body.action !== "freeze" && body.action !== "unfreeze") {
        return NextResponse.json({ error: "action must be freeze|unfreeze" }, { status: 400 });
    }

    const isFreeze = body.action === "freeze";
    const updated = await prisma.appUser.update({
        where: { id },
        data: {
            isActive: !isFreeze,
            canAccessAdmin: !isFreeze,
        },
    });
    await logAction({
        action: isFreeze ? "bot_user_freeze" : "bot_user_unfreeze",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "user",
        targetId: id,
        details: `@${updated.username}`,
    });

    return NextResponse.json({ success: true, user: updated });
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (id === admin.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

    const user = await prisma.appUser.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role === "admin") return NextResponse.json({ error: "Cannot delete admin" }, { status: 400 });

    await prisma.appUser.delete({ where: { id } });
    await logAction({
        action: "bot_user_delete",
        actorId: admin.id,
        actorUsername: admin.username,
        targetType: "user",
        targetId: id,
        details: `@${user.username}`,
    });
    return NextResponse.json({ success: true });
}
