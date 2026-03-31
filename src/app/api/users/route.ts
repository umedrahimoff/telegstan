import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";
export async function GET() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await prisma.appUser.findMany({
        orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
}

export async function POST(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const username = String(body?.username ?? "").trim().replace(/^@/, "").toLowerCase();
    if (!username) return NextResponse.json({ error: "Username is required" }, { status: 400 });

    const existing = await prisma.appUser.findUnique({ where: { username } });
    if (existing) return NextResponse.json({ error: "User already exists" }, { status: 409 });

    const user = await prisma.appUser.create({
        data: { username, role: "moderator" },
    });
    await logAction({ action: "user_add", actorId: admin.id, actorUsername: admin.username, targetType: "user", targetId: user.id, details: `@${username}` });
    return NextResponse.json(user);
}

export async function DELETE(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "User id is required" }, { status: 400 });

    const user = await prisma.appUser.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role === "admin") return NextResponse.json({ error: "Cannot suspend admin" }, { status: 400 });

    await prisma.appUser.update({
        where: { id },
        data: { canAccessAdmin: false },
    });
    await logAction({ action: "user_suspend", actorId: admin.id, actorUsername: admin.username, targetType: "user", targetId: id, details: `@${user.username}` });
    return NextResponse.json({ success: true, suspended: true });
}

export async function PATCH(req: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "User id is required" }, { status: 400 });

    const user = await prisma.appUser.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.role === "admin") return NextResponse.json({ error: "Cannot modify admin" }, { status: 400 });

    const updates: { isActive?: boolean; canAccessAdmin?: boolean } = {};
    if (typeof body?.isActive === "boolean") updates.isActive = body.isActive;
    if (typeof body?.canAccessAdmin === "boolean") updates.canAccessAdmin = body.canAccessAdmin;
    if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });
    await prisma.appUser.update({
        where: { id },
        data: updates,
    });
    await logAction({ action: "user_restore", actorId: admin.id, actorUsername: admin.username, targetType: "user", targetId: id, details: `@${user.username}` });
    return NextResponse.json({ success: true, ...updates });
}
