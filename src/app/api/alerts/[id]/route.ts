import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const alert = await prisma.alert.findUnique({
            where: { id },
        });
        if (!alert) {
            return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        return NextResponse.json(alert);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch alert" }, { status: 500 });
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const alert = await prisma.alert.findUnique({ where: { id } });
        if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

        await prisma.alert.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
    }
}
