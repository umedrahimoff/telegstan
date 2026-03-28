import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TELEGRAM_SETUP_STATE_ID } from "@/lib/telegramSetupJob";
import { verifyTelegramSetupSecret } from "@/lib/setupSecret";

export async function POST(req: Request) {
    let body: { secret?: string; password?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!verifyTelegramSetupSecret(body.secret)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pwd = typeof body.password === "string" ? body.password : "";
    if (!pwd) {
        return NextResponse.json({ error: "Пароль обязателен" }, { status: 400 });
    }

    await prisma.telegramSetupState.update({
        where: { id: TELEGRAM_SETUP_STATE_ID },
        data: { submittedPassword: pwd },
    });

    return NextResponse.json({ ok: true });
}
