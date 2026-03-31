"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Bot, Check, X, Megaphone, Users2, History, Pause, Play, Trash2, Pencil } from "lucide-react";

type BotRequest = {
    id: string;
    telegramUserId: string;
    telegramUsername: string | null;
    chatId: string;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    status: "pending" | "approved" | "rejected";
    reviewNote: string | null;
    requestedAt: string;
    reviewedAt: string | null;
    reviewedBy: { id: string; username: string } | null;
};

type BotLinkedUser = {
    id: string;
    username: string;
    role: string;
    isActive: boolean;
    canAccessAdmin: boolean;
    telegramUserId: string | null;
    telegramChatId: string | null;
    botLinkedAt: string | null;
    createdAt: string;
    lastActivityAt: string | null;
};

type BotBroadcastLog = {
    id: string;
    mode: "all" | "selected" | string;
    message: string;
    attemptedCount: number;
    sentCount: number;
    failedCount: number;
    recipientsJson: string;
    failedJson: string;
    actorUsername: string | null;
    createdAt: string;
};

export default function BotUsersPage() {
    type SectionKey = "requests" | "broadcast" | "users" | "history";
    const router = useRouter();
    const [activeSection, setActiveSection] = useState<SectionKey>("requests");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [noteById, setNoteById] = useState<Record<string, string>>({});
    const [broadcastMode, setBroadcastMode] = useState<"all" | "selected">("all");
    const [broadcastMessage, setBroadcastMessage] = useState("");
    const [broadcastSelected, setBroadcastSelected] = useState<Set<string>>(new Set());
    const [broadcastBusy, setBroadcastBusy] = useState(false);
    const [broadcastResult, setBroadcastResult] = useState<{ sent: string[]; failed: { username: string; error: string }[] } | null>(null);
    const { data: me } = useSWR<{ id: string; role: string }>("/api/auth/me", fetcher);
    const { data, mutate } = useSWR<{ requests: BotRequest[]; broadcasts: BotBroadcastLog[]; users: BotLinkedUser[] }>(
        me?.role === "admin" ? "/api/bot-users" : null,
        fetcher,
        { refreshInterval: 15000 }
    );

    useEffect(() => {
        if (me && me.role !== "admin") router.replace("/dashboard");
    }, [me, router]);

    if (!me || me.role !== "admin") return null;

    const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
    const approved = (data?.requests ?? []).filter((r) => r.status === "approved").slice(0, 50);
    const rejected = (data?.requests ?? []).filter((r) => r.status === "rejected").slice(0, 50);
    const broadcasts = data?.broadcasts ?? [];
    const users = data?.users ?? [];
    const broadcastUsers = users.filter((u) => !!u.telegramChatId && u.isActive);
    const menuItems: { key: SectionKey; title: string; icon: React.ReactNode }[] = [
        { key: "requests", title: "Pending Requests", icon: <Bot size={15} /> },
        { key: "broadcast", title: "Broadcast", icon: <Megaphone size={15} /> },
        { key: "users", title: "Bot-linked Users", icon: <Users2 size={15} /> },
        { key: "history", title: "History", icon: <History size={15} /> },
    ];

    const review = async (id: string, action: "approve" | "reject") => {
        setBusyId(id);
        try {
            await axios.post(`/api/bot-users/requests/${id}`, {
                action,
                note: noteById[id] || undefined,
            });
            mutate();
        } finally {
            setBusyId(null);
        }
    };

    useEffect(() => {
        if (me?.role !== "admin" || activeSection !== "users") return;
        void axios.post("/api/bot-users/view", { section: "users" }).catch(() => {});
    }, [activeSection, me?.role]);

    const freezeToggle = async (u: BotLinkedUser, freeze: boolean) => {
        if (!confirm(`${freeze ? "Заморозить" : "Разморозить"} @${u.username}?`)) return;
        try {
            await axios.patch(`/api/bot-users/users/${u.id}`, {
                action: freeze ? "freeze" : "unfreeze",
            });
            mutate();
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.error : "Operation failed";
            alert(typeof msg === "string" ? msg : "Operation failed");
        }
    };

    const deleteBotUser = async (u: BotLinkedUser) => {
        if (!confirm(`Удалить @${u.username} полностью?`)) return;
        try {
            await axios.delete(`/api/bot-users/users/${u.id}`);
            mutate();
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.error : "Delete failed";
            alert(typeof msg === "string" ? msg : "Delete failed");
        }
    };

    const sendBroadcast = async () => {
        if (!broadcastMessage.trim()) {
            alert("Введите текст рассылки");
            return;
        }
        if (broadcastMode === "selected" && broadcastSelected.size === 0) {
            alert("Выберите хотя бы одного пользователя");
            return;
        }
        setBroadcastBusy(true);
        setBroadcastResult(null);
        try {
            const { data } = await axios.post<{
                sent: string[];
                failed: { username: string; error: string }[];
            }>("/api/bot-users/broadcast", {
                mode: broadcastMode,
                userIds: broadcastMode === "selected" ? [...broadcastSelected] : undefined,
                message: broadcastMessage,
            });
            setBroadcastResult({ sent: data.sent, failed: data.failed });
        } catch (e: unknown) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.error : "Broadcast failed";
            alert(typeof msg === "string" ? msg : "Broadcast failed");
        } finally {
            setBroadcastBusy(false);
        }
    };

    return (
        <div className="animate-fade">
            <div style={{ marginBottom: "1.2rem" }}>
                <h1 style={{ fontSize: "1.7rem", fontWeight: 800, marginBottom: "0.25rem" }}>Bot Users</h1>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem" }}>
                    Заявки на доступ, регистрационные данные и список пользователей бота.
                </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "1rem" }}>
                <aside className="card" style={{ padding: "0.75rem", alignSelf: "start", position: "sticky", top: "1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {menuItems.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setActiveSection(item.key)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.5rem 0.65rem",
                                    borderRadius: "8px",
                                    border: "1px solid",
                                    borderColor: activeSection === item.key ? "rgba(0,163,255,0.35)" : "transparent",
                                    background: activeSection === item.key ? "rgba(0,163,255,0.12)" : "transparent",
                                    color: activeSection === item.key ? "#00A3FF" : "rgba(255,255,255,0.72)",
                                    fontSize: "0.84rem",
                                    textAlign: "left",
                                    cursor: "pointer",
                                }}
                            >
                                {item.icon}
                                {item.title}
                            </button>
                        ))}
                    </div>
                </aside>

                <div>
                    {activeSection === "requests" && (
                        <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <Bot size={16} color="#00A3FF" /> Pending Requests
                            </h2>
                            {pending.length === 0 ? (
                                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>Нет ожидающих заявок.</p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                                    {pending.map((r) => (
                                        <div key={r.id} className="card" style={{ padding: "0.7rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                                                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.9)" }}>
                                                    <div><b>@{r.telegramUsername || "no_username"}</b></div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>telegramUserId: {r.telegramUserId}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>chatId: {r.chatId}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>Имя: {r.firstName || "—"} {r.lastName || ""}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>Город: {r.city || "—"}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>Телефон: {r.phone || "—"}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>Email (Stanbase): {r.email || "—"}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.4)" }}>requested: {new Date(r.requestedAt).toLocaleString()}</div>
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "260px" }}>
                                                    <input
                                                        value={noteById[r.id] || ""}
                                                        onChange={(e) => setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                                        placeholder="Комментарий (optional)"
                                                        className="input-field"
                                                        style={{ height: "34px", fontSize: "0.8rem" }}
                                                    />
                                                    <div style={{ display: "flex", gap: "0.4rem" }}>
                                                        <button
                                                            onClick={() => review(r.id, "approve")}
                                                            disabled={busyId === r.id}
                                                            className="btn-primary"
                                                            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.4rem 0.7rem" }}
                                                        >
                                                            <Check size={14} /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => review(r.id, "reject")}
                                                            disabled={busyId === r.id}
                                                            className="btn-secondary"
                                                            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.4rem 0.7rem" }}
                                                        >
                                                            <X size={14} /> Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeSection === "broadcast" && (
                        <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Bot broadcast</h2>
                            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.55)", marginBottom: "0.6rem" }}>
                                Массовая или выборочная рассылка пользователям, привязанным к боту.
                            </p>
                            <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
                                    <input type="radio" checked={broadcastMode === "all"} onChange={() => setBroadcastMode("all")} />
                                    Всем ({broadcastUsers.length})
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
                                    <input type="radio" checked={broadcastMode === "selected"} onChange={() => setBroadcastMode("selected")} />
                                    По выбору
                                </label>
                            </div>
                            {broadcastMode === "selected" && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.6rem" }}>
                                    {broadcastUsers.map((u) => (
                                        <label key={u.id} style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center", fontSize: "0.82rem", cursor: "pointer" }}>
                                            <input
                                                type="checkbox"
                                                checked={broadcastSelected.has(u.id)}
                                                onChange={(e) =>
                                                    setBroadcastSelected((prev) => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) next.add(u.id);
                                                        else next.delete(u.id);
                                                        return next;
                                                    })
                                                }
                                            />
                                            @{u.username}
                                        </label>
                                    ))}
                                </div>
                            )}
                            <textarea
                                value={broadcastMessage}
                                onChange={(e) => setBroadcastMessage(e.target.value)}
                                rows={4}
                                maxLength={4096}
                                placeholder="Текст рассылки..."
                                style={{
                                    width: "100%",
                                    padding: "0.55rem 0.7rem",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    background: "rgba(0,0,0,0.25)",
                                    color: "rgba(255,255,255,0.9)",
                                    fontSize: "0.85rem",
                                    marginBottom: "0.6rem",
                                }}
                            />
                            <button
                                onClick={sendBroadcast}
                                disabled={broadcastBusy}
                                className="btn-primary"
                                style={{ fontSize: "0.85rem", padding: "0.45rem 0.8rem" }}
                            >
                                {broadcastBusy ? "Отправка..." : "Отправить рассылку"}
                            </button>
                            {broadcastResult && (
                                <div style={{ marginTop: "0.65rem", fontSize: "0.82rem" }}>
                                    {broadcastResult.sent.length > 0 && (
                                        <div style={{ color: "#00FF94" }}>Sent to @{broadcastResult.sent.join(", @")}</div>
                                    )}
                                    {broadcastResult.failed.length > 0 && (
                                        <div style={{ color: "#FF9F0A", marginTop: "0.25rem" }}>
                                            Failed: {broadcastResult.failed.map((f) => `@${f.username}: ${f.error}`).join("; ")}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeSection === "users" && (
                        <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Bot-linked recipients</h2>
                            {users.length === 0 ? (
                                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>Пока нет привязанных пользователей.</p>
                            ) : (
                                <div style={{ overflowX: "auto" }}>
                                    <table className="table-dashboard">
                                        <thead>
                                            <tr>
                                                <th>Username</th><th>Role</th><th>telegramUserId</th><th>chatId</th><th>Status</th><th>Linked</th><th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map((u) => (
                                                <tr key={u.id}>
                                                    <td>@{u.username}</td>
                                                    <td>{u.role}</td>
                                                    <td>{u.telegramUserId || "—"}</td>
                                                    <td>{u.telegramChatId || "—"}</td>
                                                    <td>{u.isActive ? "Active" : "Frozen"}</td>
                                                    <td>{u.botLinkedAt ? new Date(u.botLinkedAt).toLocaleString() : "—"}</td>
                                                    <td>
                                                        {u.role !== "admin" && (
                                                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                                                                <Link
                                                                    href={`/dashboard/users/${u.id}`}
                                                                    className="btn-link"
                                                                    style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.78rem", padding: "0.25rem 0.45rem" }}
                                                                    title="Редактировать каналы и ключевые слова"
                                                                >
                                                                    <Pencil size={13} /> Edit
                                                                </Link>
                                                                {u.isActive ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => freezeToggle(u, true)}
                                                                        title="Заморозить"
                                                                        style={{ background: "none", border: "none", color: "rgba(255,159,10,0.9)", cursor: "pointer", display: "flex" }}
                                                                    >
                                                                        <Pause size={14} />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => freezeToggle(u, false)}
                                                                        title="Разморозить"
                                                                        style={{ background: "none", border: "none", color: "rgba(0,255,117,0.9)", cursor: "pointer", display: "flex" }}
                                                                    >
                                                                        <Play size={14} />
                                                                    </button>
                                                                )}
                                                                {u.id !== me?.id && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => deleteBotUser(u)}
                                                                        title="Удалить"
                                                                        style={{ background: "none", border: "none", color: "rgba(255,69,69,0.9)", cursor: "pointer", display: "flex" }}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {u.role === "admin" && (
                                                            <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)" }}>—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeSection === "history" && (
                        <div className="card" style={{ padding: "1rem" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Recent reviewed requests</h2>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                                <div>
                                    <div style={{ fontSize: "0.82rem", color: "#00FF94", marginBottom: "0.45rem" }}>Approved</div>
                                    {approved.map((r) => (
                                        <div key={r.id} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", marginBottom: "0.25rem" }}>
                                            @{r.telegramUsername || "no_username"} — {r.reviewedBy ? `@${r.reviewedBy.username}` : "system"}
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <div style={{ fontSize: "0.82rem", color: "#FF9F0A", marginBottom: "0.45rem" }}>Rejected</div>
                                    {rejected.map((r) => (
                                        <div key={r.id} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", marginBottom: "0.25rem" }}>
                                            @{r.telegramUsername || "no_username"} — {r.reviewNote || "no note"}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
                                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.6rem" }}>Broadcast History</h3>
                                {broadcasts.length === 0 ? (
                                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>Пока нет отправленных рассылок.</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                                        {broadcasts.slice(0, 50).map((b) => (
                                            <div key={b.id} className="card" style={{ padding: "0.65rem" }}>
                                                <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.85)" }}>
                                                    <div>
                                                        <b>{new Date(b.createdAt).toLocaleString()}</b> — mode: <b>{b.mode}</b>, by{" "}
                                                        <b>@{b.actorUsername || "system"}</b>
                                                    </div>
                                                    <div style={{ color: "rgba(255,255,255,0.55)" }}>
                                                        attempted {b.attemptedCount}, sent {b.sentCount}, failed {b.failedCount}
                                                    </div>
                                                    <div style={{ marginTop: "0.25rem", color: "rgba(255,255,255,0.72)", whiteSpace: "pre-wrap" }}>
                                                        {b.message.length > 280 ? `${b.message.slice(0, 280)}...` : b.message}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
