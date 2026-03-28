import { prisma } from "@/lib/prisma";

export const TELEGRAM_SETUP_STATE_ID = "singleton";

export async function runTelegramSetupJob(): Promise<void> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
    const apiHash = process.env.TELEGRAM_API_HASH || "";
    if (!apiId || !apiHash) {
        await prisma.telegramSetupState.upsert({
            where: { id: TELEGRAM_SETUP_STATE_ID },
            create: {
                id: TELEGRAM_SETUP_STATE_ID,
                status: "error",
                error: "Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH",
            },
            update: { status: "error", error: "Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH", qrUrl: null, hint: null },
        });
        return;
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

    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions");

    const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

    try {
        await client.connect();
        await client.signInUserWithQrCode(
            { apiId, apiHash },
            {
                qrCode: async (qr) => {
                    const url = `tg://login?token=${qr.token.toString("base64url")}`;
                    await prisma.telegramSetupState.update({
                        where: { id: TELEGRAM_SETUP_STATE_ID },
                        data: { status: "qr", qrUrl: url },
                    });
                },
                onError: async (err) => {
                    await prisma.telegramSetupState.update({
                        where: { id: TELEGRAM_SETUP_STATE_ID },
                        data: { status: "error", error: err.message },
                    });
                    return false;
                },
                password: async (hint) => {
                    await prisma.telegramSetupState.update({
                        where: { id: TELEGRAM_SETUP_STATE_ID },
                        data: { status: "password", hint: hint || null, submittedPassword: null },
                    });
                    for (let i = 0; i < 600; i++) {
                        await new Promise((r) => setTimeout(r, 1000));
                        const row = await prisma.telegramSetupState.findUnique({
                            where: { id: TELEGRAM_SETUP_STATE_ID },
                        });
                        if (row?.submittedPassword) {
                            const pwd = row.submittedPassword;
                            await prisma.telegramSetupState.update({
                                where: { id: TELEGRAM_SETUP_STATE_ID },
                                data: { submittedPassword: null },
                            });
                            return pwd;
                        }
                        if (row?.status === "error") {
                            throw new Error(row.error || "Настройка прервана");
                        }
                    }
                    throw new Error("Таймаут ввода пароля 2FA (10 мин)");
                },
            }
        );

        const sessionStr = client.session.save() as unknown as string;
        await client.disconnect();

        await prisma.session.deleteMany({});
        await prisma.session.create({
            data: { phoneNumber: "telegstan_qr", sessionStr, isActive: true },
        });

        await prisma.telegramSetupState.update({
            where: { id: TELEGRAM_SETUP_STATE_ID },
            data: { status: "done", qrUrl: null, hint: null, error: null },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await prisma.telegramSetupState
            .update({
                where: { id: TELEGRAM_SETUP_STATE_ID },
                data: { status: "error", error: msg },
            })
            .catch(() => {});
        try {
            await client.disconnect();
        } catch {
            /* ignore */
        }
    }
}
