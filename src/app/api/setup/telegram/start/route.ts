import { after } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runTelegramSetupJob, TELEGRAM_SETUP_STATE_ID } from "@/lib/telegramSetupJob";
import { getTelegramSetupSecret, verifyTelegramSetupSecret } from "@/lib/setupSecret";

export const maxDuration = 300;

const STALE_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
    const expected = getTelegramSetupSecret();
    if (!expected) {
        return NextResponse.json(
            { error: "Не задан TGSTN_SETUP_SECRET в переменных окружения (Vercel)." },
            { status: 503 }
        );
    }

    let body: { secret?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!verifyTelegramSetupSecret(body.secret)) {
        return NextResponse.json({ error: "Неверный секрет" }, { status: 403 });
    }

    const sessionCount = await prisma.session.count();
    if (sessionCount > 0) {
        return NextResponse.json(
            { error: "Сессия Telegram уже сохранена. Вход через логин или смена сессии в настройках." },
            { status: 400 }
        );
    }

    const row = await prisma.telegramSetupState.findUnique({ where: { id: TELEGRAM_SETUP_STATE_ID } });
    if (row && ["starting", "qr", "password"].includes(row.status)) {
        const age = Date.now() - row.updatedAt.getTime();
        if (age < STALE_MS) {
            return NextResponse.json({ error: "Настройка уже запущена. Дождитесь QR или подождите 10 мин." }, { status: 409 });
        }
    }

    await prisma.telegramSetupState.upsert({
        where: { id: TELEGRAM_SETUP_STATE_ID },
        create: { id: TELEGRAM_SETUP_STATE_ID, status: "starting" },
        update: {
            status: "starting",
            qrUrl: null,
            hint: null,
            error: null,
            submittedPassword: null,
        },
    });

    after(() => {
        void runTelegramSetupJob();
    });

    return NextResponse.json({ ok: true });
}
