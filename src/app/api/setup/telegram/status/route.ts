import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TELEGRAM_SETUP_STATE_ID } from "@/lib/telegramSetupJob";
import { verifyTelegramSetupSecret } from "@/lib/setupSecret";

export async function POST(req: Request) {
    let body: { secret?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!verifyTelegramSetupSecret(body.secret)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = await prisma.telegramSetupState.findUnique({ where: { id: TELEGRAM_SETUP_STATE_ID } });
    if (!row) {
        return NextResponse.json({ status: "idle" });
    }

    return NextResponse.json({
        status: row.status,
        qrUrl: row.qrUrl,
        hint: row.hint,
        error: row.error,
    });
}
