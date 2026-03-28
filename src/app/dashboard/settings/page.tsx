"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Key, Phone, ShieldCheck, Mail, Fingerprint, Activity, Database, Download, Trash2, AlertTriangle, Users, History, Send, Loader2, RefreshCw, Clock } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";

export default function SettingsPage() {
    const router = useRouter();
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");
    const [step, setStep] = useState(1);
    const isTelegramAccountLocked = true;
    const { data: me } = useSWR<{ role: string }>("/api/auth/me", fetcher);
    const { data: dataStats, mutate: mutateData } = useSWR<{ count: number; mb: number; limitMb: number; limitReached: boolean }>(
        me?.role === "admin" ? "/api/data" : null,
        fetcher,
        { refreshInterval: 30000 }
    );
    const { data: settings, mutate: mutateSettings } = useSWR<{ parserEnabled?: boolean }>(
        me?.role === "admin" ? "/api/settings" : null,
        fetcher
    );
    const { data: users = [] } = useSWR<{ id: string; username: string; isActive: boolean }[]>(
        me?.role === "admin" ? "/api/users" : null,
        fetcher
    );
    const { data: catchUpData, mutate: mutateCatchUp } = useSWR<{
        queue: null | {
            channelIds: string[];
            index: number;
            totalChannels: number;
            done: boolean;
            currentChannelId: string | null;
            dateFrom: string;
            dateTo: string;
            gapMs: number;
            startedAt: string;
            nextEligibleAt: string;
        };
    }>(me?.role === "admin" ? "/api/settings/catch-up-backfill" : null, fetcher, { refreshInterval: 12000 });
    const [clearing, setClearing] = useState(false);
    const [savingParser, setSavingParser] = useState(false);
    const [testRecipients, setTestRecipients] = useState<Set<string>>(new Set());
    const [testMessageBody, setTestMessageBody] = useState("");
    const [sendingTest, setSendingTest] = useState(false);
    const [catchUpDateFrom, setCatchUpDateFrom] = useState("2026-03-22");
    const [catchUpDateTo, setCatchUpDateTo] = useState("");
    const [catchUpMinutes, setCatchUpMinutes] = useState(10);
    const [catchUpNotify, setCatchUpNotify] = useState(false);
    const [catchUpSaveAll, setCatchUpSaveAll] = useState(false);
    const [catchUpLoading, setCatchUpLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ sent: string[]; failed: { username: string; error: string }[]; queued?: string } | null>(null);
    const [reauthStatus, setReauthStatus] = useState<{ status: string; qrUrl?: string; hint?: string; error?: string } | null>(null);
    const [reauthPassword, setReauthPassword] = useState("");
    const [reauthPolling, setReauthPolling] = useState(false);

    useEffect(() => {
        if (me && me.role !== "admin") router.replace("/dashboard");
    }, [me, router]);

    const activeUsers = users.filter((u) => u.isActive);
    const testInitDone = useRef(false);
    useEffect(() => {
        if (activeUsers.length > 0 && !testInitDone.current) {
            setTestRecipients(new Set(activeUsers.map((u) => u.username)));
            testInitDone.current = true;
        }
    }, [activeUsers.length]);

    useEffect(() => {
        if (!reauthPolling) return;
        const fetchStatus = async () => {
            try {
                const { data } = await axios.get<{ status: string; qrUrl?: string; hint?: string; error?: string }>("/api/settings/reauth/status");
                setReauthStatus(data);
                if (data.status === "done" || data.status === "error") setReauthPolling(false);
            } catch {}
        };
        fetchStatus();
        const t = setInterval(fetchStatus, 1500);
        return () => clearInterval(t);
    }, [reauthPolling]);

    if (!me) return <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading...</div>;
    if (me.role !== "admin") return <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Redirecting...</div>;

    return (
        <div className="animate-fade">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Settings</h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>Configure your Telegram user account and monitoring settings.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <Fingerprint size={18} color="#00A3FF" />
                        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Telegram Account</h2>
                    </div>

                    {isTelegramAccountLocked && (
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>
                            Telegram account is already connected via server configuration and cannot be changed from the admin panel.
                        </p>
                    )}

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Re-authenticate</h3>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem' }}>
                            If Telegram reset the session or Sync fails — re-auth via QR. 2FA will be prompted if enabled.
                        </p>
                        {!reauthStatus || reauthStatus.status === "idle" ? (
                            <button
                                onClick={async () => {
                                    try {
                                        await axios.post("/api/settings/reauth");
                                        setReauthStatus({ status: "starting" });
                                        setReauthPolling(true);
                                    } catch (e: any) {
                                        setReauthStatus({ status: "error", error: e.response?.data?.error || "Failed" });
                                    }
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(0,163,255,0.15)', border: '1px solid rgba(0,163,255,0.3)', borderRadius: '8px', color: '#00A3FF', cursor: 'pointer' }}
                            >
                                <RefreshCw size={14} />
                                Start re-auth (QR)
                            </button>
                        ) : reauthStatus.status === "starting" ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                                <Loader2 size={16} className="animate-spin" />
                                Connecting…
                            </div>
                        ) : reauthStatus.status === "qr" && reauthStatus.qrUrl ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Scan with Telegram → Settings → Devices → Link Desktop Device</p>
                                <div style={{ padding: '0.75rem', background: 'white', borderRadius: '8px', width: 'fit-content' }}>
                                    <QRCodeSVG value={reauthStatus.qrUrl} size={200} level="M" />
                                </div>
                            </div>
                        ) : reauthStatus.status === "password" ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>2FA password{reauthStatus.hint ? ` (hint: ${reauthStatus.hint})` : ""}</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={reauthPassword}
                                        onChange={(e) => setReauthPassword(e.target.value)}
                                        placeholder="Password"
                                        style={{ flex: 1, height: '36px', fontSize: '0.85rem' }}
                                    />
                                    <button
                                        onClick={async () => {
                                            try {
                                                await axios.post("/api/settings/reauth/password", { password: reauthPassword });
                                                setReauthPassword("");
                                            } catch {}
                                        }}
                                        disabled={!reauthPassword.trim()}
                                        className="btn-primary"
                                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.85rem' }}
                                    >
                                        Submit
                                    </button>
                                </div>
                            </div>
                        ) : reauthStatus.status === "done" ? (
                            <div>
                                <p style={{ fontSize: '0.85rem', color: '#00FF75', marginBottom: '0.5rem' }}>✅ Session saved. Redeploy worker on Railway.</p>
                                <button onClick={() => setReauthStatus(null)} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>Start over</button>
                            </div>
                        ) : reauthStatus.status === "error" ? (
                            <div>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,159,10,0.9)', marginBottom: '0.5rem' }}>❌ {reauthStatus.error}</p>
                                <button onClick={() => setReauthStatus(null)} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>Try again</button>
                            </div>
                        ) : null}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Step 1: API Information */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>API ID</label>
                            <div style={{ display: 'flex', position: 'relative' }}>
                                <Key size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                <input
                                    className="input-field text-[0.85rem]"
                                    value={apiId}
                                    onChange={(e) => setApiId(e.target.value)}
                                    placeholder="Enter your API ID"
                                    style={{ paddingLeft: '2.25rem', height: '36px' }}
                                    disabled={isTelegramAccountLocked}
                                    readOnly={isTelegramAccountLocked}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>API HASH</label>
                            <div style={{ display: 'flex', position: 'relative' }}>
                                <ShieldCheck size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                <input
                                    className="input-field text-[0.85rem]"
                                    value={apiHash}
                                    onChange={(e) => setApiHash(e.target.value)}
                                    placeholder="Enter your API HASH"
                                    style={{ paddingLeft: '2.25rem', height: '36px' }}
                                    disabled={isTelegramAccountLocked}
                                    readOnly={isTelegramAccountLocked}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Phone Number</label>
                            <div style={{ display: 'flex', position: 'relative' }}>
                                <Phone size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                <input
                                    className="input-field text-[0.85rem]"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+1 234 567 890"
                                    style={{ paddingLeft: '2.25rem', height: '36px' }}
                                    disabled={isTelegramAccountLocked}
                                    readOnly={isTelegramAccountLocked}
                                />
                            </div>
                        </div>

                        {step === 3 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Verification Code</label>
                                <div style={{ display: 'flex', position: 'relative' }}>
                                    <Mail size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                                    <input
                                        className="input-field text-[0.85rem]"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        placeholder="12345"
                                        style={{ paddingLeft: '2.25rem', height: '36px' }}
                                        disabled={isTelegramAccountLocked}
                                        readOnly={isTelegramAccountLocked}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                                className="btn-primary"
                                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                onClick={() => {
                                    if (!isTelegramAccountLocked) {
                                        setStep(step + 1);
                                    }
                                }}
                                disabled={isTelegramAccountLocked}
                            >
                                {isTelegramAccountLocked
                                    ? "Telegram account is already connected"
                                    : step === 1
                                    ? "Start Session"
                                    : step === 2
                                    ? "Send OTP"
                                    : "Complete Authentication"}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <History size={18} color="#BF5AF2" />
                            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Parser</h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>
                            Parse old messages (backfill) — scan historical messages for channels. When disabled, the feature is hidden from the UI.
                        </p>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input
                                type="checkbox"
                                checked={settings?.parserEnabled !== false}
                                disabled={savingParser}
                                onChange={async (e) => {
                                    setSavingParser(true);
                                    try {
                                        await axios.post('/api/settings', { parserEnabled: e.target.checked });
                                        mutateSettings();
                                    } catch {
                                        alert('Error');
                                    } finally {
                                        setSavingParser(false);
                                    }
                                }}
                                style={{ accentColor: '#BF5AF2' }}
                            />
                            Parser enabled
                        </label>
                    </div>

                    <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <Clock size={18} color="#00A3FF" />
                            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Догон по каналам (catch-up)</h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem' }}>
                            Все активные каналы по очереди на <b>Railway-воркере</b>: история за период, пауза между каналами ~ (выбранные минуты ÷ число каналов), минимум 8 с. Не грузит Telegram разом.
                        </p>
                        {catchUpData?.queue && !catchUpData.queue.done && (
                            <div
                                style={{
                                    marginBottom: '0.75rem',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '8px',
                                    background: 'rgba(0,163,255,0.12)',
                                    border: '1px solid rgba(0,163,255,0.25)',
                                    fontSize: '0.8rem',
                                    color: 'rgba(255,255,255,0.85)',
                                }}
                            >
                                В очереди: канал {catchUpData.queue.index + 1} / {catchUpData.queue.totalChannels}
                                {catchUpData.queue.currentChannelId ? ` (id ${catchUpData.queue.currentChannelId.slice(0, 8)}…)` : ""}. Пауза ~{Math.round(catchUpData.queue.gapMs / 1000)} с между каналами.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem', maxWidth: '22rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                С даты
                                <input
                                    type="date"
                                    value={catchUpDateFrom}
                                    onChange={(e) => setCatchUpDateFrom(e.target.value)}
                                    style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
                                />
                            </label>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                По дату (пусто = сейчас)
                                <input
                                    type="date"
                                    value={catchUpDateTo}
                                    onChange={(e) => setCatchUpDateTo(e.target.value)}
                                    style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
                                />
                            </label>
                            <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                Разнести старт каналов на ~минут
                                <input
                                    type="number"
                                    min={1}
                                    max={120}
                                    value={catchUpMinutes}
                                    onChange={(e) => setCatchUpMinutes(Math.min(120, Math.max(1, parseInt(e.target.value, 10) || 10)))}
                                    style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
                                />
                            </label>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.35rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={catchUpSaveAll} onChange={(e) => setCatchUpSaveAll(e.target.checked)} style={{ accentColor: '#00A3FF' }} />
                            Сохранять все сообщения с текстом в периоде (иначе только посты с совпадением по ключам)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={catchUpNotify} onChange={(e) => setCatchUpNotify(e.target.checked)} style={{ accentColor: '#00A3FF' }} />
                            Отправлять уведомления в Telegram при совпадениях (обычно выкл. для догона)
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                disabled={catchUpLoading || settings?.parserEnabled === false}
                                onClick={async () => {
                                    setCatchUpLoading(true);
                                    try {
                                        const from = catchUpDateFrom ? `${catchUpDateFrom}T00:00:00.000Z` : undefined;
                                        const to = catchUpDateTo ? `${catchUpDateTo}T23:59:59.999Z` : undefined;
                                        const { data } = await axios.post("/api/settings/catch-up-backfill", {
                                            dateFrom: from,
                                            dateTo: to,
                                            totalMinutes: catchUpMinutes,
                                            sendNotifications: catchUpNotify,
                                            saveAll: catchUpSaveAll,
                                        });
                                        alert(data.message || "Очередь создана");
                                        mutateCatchUp();
                                    } catch (e: unknown) {
                                        const msg = axios.isAxiosError(e) ? e.response?.data?.error : "Ошибка";
                                        alert(typeof msg === "string" ? msg : "Ошибка");
                                    } finally {
                                        setCatchUpLoading(false);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.45rem 0.85rem',
                                    fontSize: '0.85rem',
                                    background: 'rgba(0,163,255,0.2)',
                                    border: '1px solid rgba(0,163,255,0.35)',
                                    borderRadius: '8px',
                                    color: '#00A3FF',
                                    cursor: catchUpLoading || settings?.parserEnabled === false ? "not-allowed" : "pointer",
                                }}
                            >
                                {catchUpLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Запустить очередь
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!confirm("Сбросить очередь catch-up?")) return;
                                    try {
                                        await axios.delete("/api/settings/catch-up-backfill");
                                        mutateCatchUp();
                                    } catch {
                                        alert("Не удалось сбросить");
                                    }
                                }}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    fontSize: '0.85rem',
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    color: 'rgba(255,255,255,0.6)',
                                    cursor: "pointer",
                                }}
                            >
                                Сбросить очередь
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <Activity size={18} color="#00FF94" />
                            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Notification Settings</h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1rem' }}>
                            Only users in the Users list receive alerts. Add users there and configure per-user channels and keywords per user.
                        </p>
                        <Link
                            href="/dashboard/users"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(0,163,255,0.15)', border: '1px solid rgba(0,163,255,0.3)', borderRadius: '8px', color: '#00A3FF', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, width: 'fit-content', marginBottom: '1rem' }}
                        >
                            <Users size={16} />
                            Manage Users
                        </Link>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Test notification</h3>
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem' }}>
                                Send a test message to verify the service is working. Leave the text empty to use the default HTML template; otherwise your text is sent as plain (no HTML tags).
                            </p>
                            <textarea
                                value={testMessageBody}
                                onChange={(e) => setTestMessageBody(e.target.value)}
                                placeholder="Custom message (optional, max 4096 chars)…"
                                rows={3}
                                maxLength={4096}
                                style={{
                                    width: '100%',
                                    maxWidth: '32rem',
                                    marginBottom: '0.75rem',
                                    padding: '0.6rem 0.75rem',
                                    fontSize: '0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    background: 'rgba(0,0,0,0.25)',
                                    color: 'rgba(255,255,255,0.9)',
                                    resize: 'vertical',
                                }}
                            />
                            {activeUsers.length === 0 ? (
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>No active users. Add users first.</p>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        {activeUsers.map((u) => (
                                            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={testRecipients.has(u.username)}
                                                    onChange={(e) => {
                                                        setTestRecipients((prev) => {
                                                            const next = new Set(prev);
                                                            if (e.target.checked) next.add(u.username);
                                                            else next.delete(u.username);
                                                            return next;
                                                        });
                                                    }}
                                                    style={{ accentColor: '#00FF94' }}
                                                />
                                                @{u.username}
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={async () => {
                                                if (testRecipients.size === 0) { alert('Select at least one user'); return; }
                                                setSendingTest(true);
                                                setTestResult(null);
                                                try {
                                                    const { data } = await axios.post<{ sent: string[]; failed: { username: string; error: string }[]; queued?: boolean; message?: string }>('/api/settings/test-notification', {
                                                        usernames: [...testRecipients],
                                                        message: testMessageBody.trim() || undefined,
                                                    });
                                                    setTestResult({
                                                        sent: data.sent,
                                                        failed: data.failed,
                                                        ...(data.queued && data.message ? { queued: data.message } : {}),
                                                    });
                                                } catch (e: any) {
                                                    setTestResult({ sent: [], failed: [{ username: '', error: e.response?.data?.error || 'Failed' }] });
                                                } finally {
                                                    setSendingTest(false);
                                                }
                                            }}
                                            disabled={sendingTest || testRecipients.size === 0}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(0,255,148,0.15)', border: '1px solid rgba(0,255,148,0.3)', borderRadius: '8px', color: '#00FF94', cursor: sendingTest || testRecipients.size === 0 ? 'not-allowed' : 'pointer' }}
                                        >
                                            {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                            {sendingTest ? 'Sending…' : 'Send test message'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTestRecipients(new Set(activeUsers.map((u) => u.username)))}
                                            style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                                        >
                                            Select all
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTestRecipients(new Set())}
                                            style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    {testResult && (
                                        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                                            {testResult.queued && (
                                                <span style={{ color: '#00A3FF' }}>{testResult.queued}</span>
                                            )}
                                            {testResult.sent.length > 0 && (
                                                <span style={{ color: '#00FF94' }}>Sent to @{testResult.sent.join(', @')}</span>
                                            )}
                                            {testResult.failed.length > 0 && (
                                                <div style={{ color: 'rgba(255,159,10,0.9)', marginTop: '0.25rem' }}>
                                                    Failed: {testResult.failed.map((f) => f.username ? `@${f.username}: ${f.error}` : f.error).join('; ')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <Database size={18} color="#BF5AF2" />
                            <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Post Storage</h2>
                        </div>
                        {dataStats && (
                            <>
                                <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                    <span style={{ fontWeight: 600 }}>{dataStats.count.toLocaleString()}</span> posts · <span style={{ fontWeight: 600 }}>{dataStats.mb.toFixed(2)} MB</span> / {dataStats.limitMb} MB
                                </div>
                                {dataStats.limitReached && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255,159,10,0.15)', borderRadius: '10px', marginBottom: '1rem', color: '#FF9F0A', fontSize: '0.85rem' }}>
                                        <AlertTriangle size={18} />
                                        Limit reached. Export data to CSV and clear storage.
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <a
                                        href="/api/data/export"
                                        download
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(0,163,255,0.15)', border: '1px solid rgba(0,163,255,0.3)', borderRadius: '8px', color: '#00A3FF', textDecoration: 'none', cursor: 'pointer' }}
                                    >
                                        <Download size={14} />
                                        Export CSV
                                    </a>
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Delete all saved posts? This will free up space. Alerts will not be affected.')) return;
                                            setClearing(true);
                                            try {
                                                await axios.post('/api/data/clear');
                                                mutateData();
                                            } catch (e) {
                                                alert('Error');
                                            } finally {
                                                setClearing(false);
                                            }
                                        }}
                                        disabled={clearing}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(255,69,69,0.15)', border: '1px solid rgba(255,69,69,0.3)', borderRadius: '8px', color: '#FF4545', cursor: clearing ? 'not-allowed' : 'pointer' }}
                                    >
                                        <Trash2 size={14} />
                                        {clearing ? '…' : 'Clear'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
