"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Bot, Check, X, Satellite } from "lucide-react";

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

type BotSuggestion = {
    id: string;
    telegramUserId: string;
    telegramUsername: string | null;
    chatId: string;
    channelInput: string;
    status: "pending" | "reviewed";
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
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

export default function BotUsersPage() {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
    const [noteById, setNoteById] = useState<Record<string, string>>({});
    const [suggestionNoteById, setSuggestionNoteById] = useState<Record<string, string>>({});
    const { data: me } = useSWR<{ role: string }>("/api/auth/me", fetcher);
    const { data, mutate } = useSWR<{ requests: BotRequest[]; suggestions: BotSuggestion[]; users: BotLinkedUser[] }>(
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
    const pendingSuggestions = (data?.suggestions ?? []).filter((s) => s.status === "pending");
    const users = data?.users ?? [];

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

    const reviewSuggestion = async (id: string) => {
        setBusySuggestionId(id);
        try {
            await axios.post(`/api/bot-users/suggestions/${id}`, {
                note: suggestionNoteById[id] || undefined,
            });
            mutate();
        } finally {
            setBusySuggestionId(null);
        }
    };

    return (
        <div className="animate-fade">
            <div style={{ marginBottom: "1.2rem" }}>
                <h1 style={{ fontSize: "1.7rem", fontWeight: 800, marginBottom: "0.25rem" }}>Bot Users</h1>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.9rem" }}>
                    Заявки на подписку, регистрационные данные и предложения каналов из бота.
                </p>
            </div>

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

            <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Satellite size={16} color="#FF9F0A" /> Channel suggestions
                </h2>
                {pendingSuggestions.length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>Нет новых предложений каналов.</p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        {pendingSuggestions.map((s) => (
                            <div key={s.id} className="card" style={{ padding: "0.7rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                                    <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.9)" }}>
                                        <div><b>@{s.telegramUsername || "no_username"}</b></div>
                                        <div style={{ color: "rgba(255,255,255,0.55)" }}>Канал: {s.channelInput}</div>
                                        <div style={{ color: "rgba(255,255,255,0.4)" }}>created: {new Date(s.createdAt).toLocaleString()}</div>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "260px" }}>
                                        <input
                                            value={suggestionNoteById[s.id] || ""}
                                            onChange={(e) => setSuggestionNoteById((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                            placeholder="Комментарий (optional)"
                                            className="input-field"
                                            style={{ height: "34px", fontSize: "0.8rem" }}
                                        />
                                        <button
                                            onClick={() => reviewSuggestion(s.id)}
                                            disabled={busySuggestionId === s.id}
                                            className="btn-primary"
                                            style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.4rem 0.7rem", width: "fit-content" }}
                                        >
                                            <Check size={14} /> Mark reviewed
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Bot-linked recipients</h2>
                {users.length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>Пока нет привязанных пользователей.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="table-dashboard">
                            <thead>
                                <tr>
                                    <th>Username</th><th>Role</th><th>telegramUserId</th><th>chatId</th><th>Linked</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>@{u.username}</td>
                                        <td>{u.role}</td>
                                        <td>{u.telegramUserId || "—"}</td>
                                        <td>{u.telegramChatId || "—"}</td>
                                        <td>{u.botLinkedAt ? new Date(u.botLinkedAt).toLocaleString() : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

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
            </div>
        </div>
    );
}
