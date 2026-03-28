import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTelegramSetupSecret } from "@/lib/setupSecret";

/** Публично: нужна ли привязка Telegram (нет строки Session). */
export async function GET() {
    const count = await prisma.session.count();
    return NextResponse.json({
        needsSession: count === 0,
        setupConfigured: Boolean(getTelegramSetupSecret()),
    });
}
