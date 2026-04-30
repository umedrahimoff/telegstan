import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/actionLog";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireAdmin();
        if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;
        const body = await req.json();

        const data: { isActive?: boolean; recipients?: { deleteMany: object; create: { username: string }[] } } = {};
        if (typeof body.isActive === "boolean") data.isActive = body.isActive;
        if (Array.isArray(body.recipients)) {
            const usernames = body.recipients
                .map((u: string) => String(u).trim().replace(/^@/, "").toLowerCase())
                .filter(Boolean);
            data.recipients = {
                deleteMany: {},
                create: usernames.map((u: string) => ({ username: u })),
            };
        }

        const updated = await prisma.globalKeyword.update({
            where: { id },
            data,
            include: { recipients: { select: { username: true } } },
        });
        await logAction({ action: "global_keyword_edit", actorId: user.id, actorUsername: user.username, targetType: "global_keyword", targetId: id, details: `"${updated.text}"` });
        return NextResponse.json({
            id: updated.id,
            text: updated.text,
            isActive: updated.isActive,
            recipients: updated.recipients.map((r) => r.username),
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
}
