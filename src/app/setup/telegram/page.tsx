"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Smartphone } from "lucide-react";
import Link from "next/link";

type PollStatus = "idle" | "starting" | "qr" | "password" | "done" | "error";

export default function TelegramSetupPage() {
    const [secret, setSecret] = useState("");
    const [needsInfo, setNeedsInfo] = useState<{ needsSession: boolean; setupConfigured: boolean } | null>(null);
    const [status, setStatus] = useState<PollStatus>("idle");
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState("");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPoll = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => {
        axios
            .get("/api/setup/telegram/needs")
            .then((r) => setNeedsInfo(r.data))
            .catch(() => setNeedsInfo({ needsSession: true, setupConfigured: false }));
        return () => stopPoll();
    }, [stopPoll]);

    const poll = useCallback(
        (s: string) => {
            stopPoll();
            pollRef.current = setInterval(async () => {
                try {
                    const { data } = await axios.post("/api/setup/telegram/status", { secret: s });
                    const st = data.status as PollStatus;
                    setStatus(st);
                    setQrUrl(data.qrUrl || null);
                    setHint(data.hint || null);
                    setError(data.error || null);
                    if (st === "done") {
                        stopPoll();
                        window.location.href = "/login";
                    }
                    if (st === "error") {
                        stopPoll();
                    }
                } catch {
                    /* ignore transient */
                }
            }, 1500);
        },
        [stopPoll]
    );

    const start = async () => {
        const s = secret.trim();
        if (!s) {
            setError("Введите секрет из TGSTN_SETUP_SECRET");
            return;
        }
        setLoading(true);
        setError(null);
        setStatus("starting");
        try {
            await axios.post("/api/setup/telegram/start", { secret: s });
            poll(s);
        } catch (e: unknown) {
            const msg =
                axios.isAxiosError(e) && e.response?.data?.error
                    ? String(e.response.data.error)
                    : "Не удалось запустить";
            setError(msg);
            setStatus("idle");
        } finally {
            setLoading(false);
        }
    };

    const submitPassword = async () => {
        const s = secret.trim();
        if (!password.trim()) return;
        setLoading(true);
        try {
            await axios.post("/api/setup/telegram/password", { secret: s, password: password.trim() });
            setPassword("");
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) && e.response?.data?.error ? String(e.response.data.error) : "Ошибка";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (needsInfo && !needsInfo.needsSession) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    background: "#0D0E12",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    padding: "1.5rem",
                    fontFamily: "Inter, sans-serif",
                }}
            >
                <div className="card" style={{ maxWidth: "420px", padding: "2rem", textAlign: "center" }}>
                    <p style={{ marginBottom: "1rem" }}>Сессия Telegram уже есть — вход через обычный логин.</p>
                    <Link href="/login" className="btn-primary" style={{ display: "inline-block", padding: "0.75rem 1.5rem" }}>
                        На страницу входа
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#0D0E12",
                backgroundImage: "radial-gradient(circle at 50% 40%, rgba(0, 163, 255, 0.06) 0%, transparent 60%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.5rem",
                color: "white",
                fontFamily: "Inter, sans-serif",
            }}
        >
            <div className="card animate-fade" style={{ maxWidth: "440px", width: "100%", padding: "2.25rem" }}>
                <div
                    style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "16px",
                        background: "rgba(0,163,255,0.12)",
                        border: "1px solid rgba(0,163,255,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "1.25rem",
                    }}
                >
                    <Smartphone color="#00A3FF" size={26} />
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Привязка Telegram</h1>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                    Первый раз: отсканируй QR в Telegram (Настройки → Устройства → Привязать устройство). Секрет задаётся в
                    Vercel как <code style={{ color: "#7dd3fc" }}>TGSTN_SETUP_SECRET</code>.
                </p>

                {needsInfo && !needsInfo.setupConfigured && (
                    <div
                        style={{
                            background: "rgba(255,180,0,0.1)",
                            border: "1px solid rgba(255,180,0,0.25)",
                            color: "#ffb84d",
                            padding: "0.75rem",
                            borderRadius: "10px",
                            fontSize: "0.85rem",
                            marginBottom: "1rem",
                        }}
                    >
                        В окружении не задан TGSTN_SETUP_SECRET — страница не сможет запустить привязку.
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            background: "rgba(255,69,69,0.1)",
                            color: "#FF6B6B",
                            padding: "0.75rem",
                            borderRadius: "10px",
                            fontSize: "0.85rem",
                            marginBottom: "1rem",
                            border: "1px solid rgba(255,69,69,0.2)",
                        }}
                    >
                        {error}
                    </div>
                )}

                <label style={{ display: "block", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginBottom: "0.35rem" }}>
                    Секрет настройки
                </label>
                <input
                    className="input-field"
                    type="password"
                    autoComplete="off"
                    placeholder="Значение TGSTN_SETUP_SECRET"
                    style={{ width: "100%", height: "48px", marginBottom: "1rem" }}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    disabled={loading || (status !== "idle" && status !== "error")}
                />

                {(status === "idle" || status === "error") && (
                    <button className="btn-primary" style={{ width: "100%", height: "48px" }} onClick={start} disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : "Запустить QR-авторизацию"}
                    </button>
                )}

                {(status === "starting" || (status === "qr" && !qrUrl)) && (
                    <div style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,0.5)" }}>
                        <Loader2 className="animate-spin" size={28} style={{ margin: "0 auto 0.75rem" }} />
                        Подключение к Telegram…
                    </div>
                )}

                {status === "qr" && qrUrl && (
                    <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: "1rem" }}>
                            Отсканируй камерой в приложении Telegram
                        </p>
                        <div style={{ display: "inline-block", padding: "1rem", background: "white", borderRadius: "12px" }}>
                            <QRCodeSVG value={qrUrl} size={220} level="M" />
                        </div>
                    </div>
                )}

                {status === "password" && (
                    <div style={{ marginTop: "1rem" }}>
                        <p style={{ fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                            Включена двухфакторная аутентификация{hint ? ` (${hint})` : ""}.
                        </p>
                        <input
                            className="input-field"
                            type="password"
                            placeholder="Пароль 2FA"
                            style={{ width: "100%", height: "48px", marginBottom: "0.75rem" }}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submitPassword()}
                        />
                        <button className="btn-primary" style={{ width: "100%", height: "48px" }} onClick={submitPassword} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Отправить пароль"}
                        </button>
                    </div>
                )}

                <p style={{ marginTop: "1.5rem", textAlign: "center" }}>
                    <Link href="/login" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.85rem" }}>
                        Назад к входу
                    </Link>
                </p>
            </div>
        </div>
    );
}
