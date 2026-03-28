import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPendingReauth, setPendingReauth } from "@/lib/reauthState";

export async function POST() {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const current = getPendingReauth();
    if (current && current.status !== "done" && current.status !== "error") {
        return NextResponse.json({ error: "Reauth already in progress" }, { status: 400 });
    }

    setPendingReauth({ status: "starting" });

    (async () => {
        const { TelegramClient } = await import("telegram");
        const { StringSession } = await import("telegram/sessions");
        const { prisma } = await import("@/lib/prisma");

        const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
        const apiHash = process.env.TELEGRAM_API_HASH || "";
        if (!apiId || !apiHash) {
            setPendingReauth({ status: "error", error: "TELEGRAM_API_ID or TELEGRAM_API_HASH not set" });
            return;
        }

        const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

        try {
            await client.connect();

            await client.signInUserWithQrCode(
                { apiId, apiHash },
                {
                    qrCode: async (qr) => {
                        const url = `tg://login?token=${qr.token.toString("base64url")}`;
                        setPendingReauth({ status: "qr", qrUrl: url });
                    },
                    onError: async (err) => {
                        setPendingReauth({ status: "error", error: err.message });
                        return true;
                    },
                    password: async (hint) => {
                        setPendingReauth({ status: "password", hint: hint || undefined });
                        return new Promise<string>((resolve) => {
                            const p = getPendingReauth();
                            if (p) (p as { passwordResolver?: (s: string) => void }).passwordResolver = resolve;
                        });
                    },
                }
            );

            const sessionStr = client.session.save() as unknown as string;
            await client.disconnect();

            await prisma.session.deleteMany({});
            await prisma.session.create({
                data: { phoneNumber: "telegstan_qr", sessionStr, isActive: true },
            });

            setPendingReauth({ status: "done" });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setPendingReauth({ status: "error", error: msg });
        }
    })();

    return NextResponse.json({ ok: true });
}
