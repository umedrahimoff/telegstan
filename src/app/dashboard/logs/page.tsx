"use client";

import { useState } from "react";
import { FileText, Calendar, CheckCircle, XCircle, ExternalLink, User, Activity } from "lucide-react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { FilterCard, filterClasses } from "@/components/FilterCard";
import { cn } from "@/lib/cn";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { formatDate } from "@/lib/date";
import Link from "next/link";

interface LogEntry {
    id: string;
    type: string;
    keyword: string;
    sourceChannel: string;
    recipient: string;
    success: boolean;
    errorMessage: string | null;
    alertId: string | null;
    contentPreview: string | null;
    postLink: string | null;
    createdAt: string;
}

interface ActionEntry {
    id: string;
    action: string;
    actorId: string;
    actorUsername: string;
    targetType: string | null;
    targetId: string | null;
    details: string | null;
    createdAt: string;
}

const PAGE_SIZE = 30;
const ACTION_LABELS: Record<string, string> = {
    user_add: "User added",
    user_suspend: "User suspended",
    user_restore: "User restored",
    user_delete: "User deleted",
    user_edit: "User edited",
    channel_add: "Channel added",
    channel_remove: "Channel removed",
    channel_toggle: "Channel toggled",
    channel_edit: "Channel edited",
    keyword_add: "Keyword added",
    keyword_remove: "Keyword removed",
    global_keyword_add: "Global keyword added",
    global_keyword_edit: "Global keyword edited",
    global_keyword_remove: "Global keyword removed",
    settings_change: "Settings changed",
    bot_user_freeze: "Bot user frozen",
    bot_user_unfreeze: "Bot user unfrozen",
    bot_user_delete: "Bot user deleted",
    bot_users_list_view: "Bot Users data loaded",
    bot_users_section_view: "Bot Users section opened",
    "bot_users_*": "Bot Users (all events)",
};

export default function LogsPage() {
    const [tab, setTab] = useState<"notifications" | "actions">("notifications");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [recipientFilter, setRecipientFilter] = useState<string>("");
    const [keywordFilter, setKeywordFilter] = useState<string>("");
    const [channelFilter, setChannelFilter] = useState<string>("");
    const [successFilter, setSuccessFilter] = useState<string>("");
    const [actionFilter, setActionFilter] = useState<string>("");
    const [actorFilter, setActorFilter] = useState<string>("");
    const [page, setPage] = useState(1);

    const notifParams = new URLSearchParams();
    notifParams.set("page", String(page));
    notifParams.set("pageSize", String(PAGE_SIZE));
    if (dateFrom) notifParams.set("dateFrom", dateFrom);
    if (dateTo) notifParams.set("dateTo", dateTo);
    if (typeFilter) notifParams.set("type", typeFilter);
    if (recipientFilter.trim()) notifParams.set("recipient", recipientFilter.trim());
    if (keywordFilter.trim()) notifParams.set("keyword", keywordFilter.trim());
    if (channelFilter.trim()) notifParams.set("sourceChannel", channelFilter.trim());
    if (successFilter) notifParams.set("success", successFilter);

    const actionParams = new URLSearchParams();
    actionParams.set("page", String(page));
    actionParams.set("pageSize", String(PAGE_SIZE));
    if (dateFrom) actionParams.set("dateFrom", dateFrom);
    if (dateTo) actionParams.set("dateTo", dateTo);
    if (actionFilter) actionParams.set("action", actionFilter);
    if (actorFilter.trim()) actionParams.set("actor", actorFilter.trim());

    const logsKey = `/api/logs?${notifParams.toString()}`;
    const actionsKey = `/api/logs/actions?${actionParams.toString()}`;
    const { data, isLoading } = useSWR<{ items: LogEntry[]; total: number }>(tab === "notifications" ? logsKey : null, fetcher, { refreshInterval: 10000 });
    const { data: actionsData, isLoading: actionsLoading } = useSWR<{ items: ActionEntry[]; total: number }>(tab === "actions" ? actionsKey : null, fetcher, { refreshInterval: 10000 });
    const logs = data?.items ?? [];
    const actions = actionsData?.items ?? [];
    const total = (tab === "notifications" ? data?.total : actionsData?.total) ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const hasFilters = dateFrom || dateTo || (tab === "notifications" ? (typeFilter || recipientFilter.trim() || keywordFilter.trim() || channelFilter.trim() || successFilter) : (actionFilter || actorFilter.trim()));

    const resetPage = () => setPage(1);

    const clearFilters = () => {
        setDateFrom("");
        setDateTo("");
        setTypeFilter("");
        setRecipientFilter("");
        setKeywordFilter("");
        setChannelFilter("");
        setSuccessFilter("");
        setActionFilter("");
        setActorFilter("");
        setPage(1);
    };

    return (
        <div className="animate-fade">
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.25rem" }}>
                        Logs
                    </h1>
                    <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem" }}>
                        {tab === "notifications" ? "Outgoing Telegram notifications." : "Admin actions: users, channels, keywords, settings."}
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                        onClick={() => { setTab("notifications"); setPage(1); }}
                        style={{
                            padding: "0.5rem 1rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            borderRadius: "8px",
                            border: "1px solid",
                            background: tab === "notifications" ? "rgba(0,163,255,0.2)" : "transparent",
                            borderColor: tab === "notifications" ? "rgba(0,163,255,0.5)" : "rgba(255,255,255,0.15)",
                            color: tab === "notifications" ? "#00A3FF" : "rgba(255,255,255,0.6)",
                            cursor: "pointer",
                        }}
                    >
                        <FileText size={16} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
                        Notifications
                    </button>
                    <button
                        onClick={() => { setTab("actions"); setPage(1); }}
                        style={{
                            padding: "0.5rem 1rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            borderRadius: "8px",
                            border: "1px solid",
                            background: tab === "actions" ? "rgba(191,90,242,0.2)" : "transparent",
                            borderColor: tab === "actions" ? "rgba(191,90,242,0.5)" : "rgba(255,255,255,0.15)",
                            color: tab === "actions" ? "#BF5AF2" : "rgba(255,255,255,0.6)",
                            cursor: "pointer",
                        }}
                    >
                        <Activity size={16} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
                        Actions
                    </button>
                </div>
            </div>

            <FilterCard>
                <div className={filterClasses.field}>
                    <label className={filterClasses.label}>Date from</label>
                    <input
                        type="date"
                        className={cn("input-field", filterClasses.input)}
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
                    />
                </div>
                <div className={filterClasses.field}>
                    <label className={filterClasses.label}>Date to</label>
                    <input
                        type="date"
                        className={cn("input-field", filterClasses.input)}
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
                    />
                </div>
                {tab === "notifications" ? (
                    <>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Type</label>
                            <select
                                className={cn("input-field", filterClasses.input)}
                                value={typeFilter}
                                onChange={(e) => { setTypeFilter(e.target.value); resetPage(); }}
                            >
                                <option value="">All</option>
                                <option value="channel">Channel</option>
                                <option value="global">Global</option>
                            </select>
                        </div>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Recipient</label>
                            <input
                                type="text"
                                className={cn("input-field", filterClasses.input, "min-w-[120px]")}
                                placeholder="@username"
                                value={recipientFilter}
                                onChange={(e) => { setRecipientFilter(e.target.value); resetPage(); }}
                            />
                        </div>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Keyword</label>
                            <input
                                type="text"
                                className={cn("input-field", filterClasses.input, "min-w-[100px]")}
                                placeholder="Keyword..."
                                value={keywordFilter}
                                onChange={(e) => { setKeywordFilter(e.target.value); resetPage(); }}
                            />
                        </div>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Source channel</label>
                            <input
                                type="text"
                                className={cn("input-field", filterClasses.input, "min-w-[120px]")}
                                placeholder="Channel name..."
                                value={channelFilter}
                                onChange={(e) => { setChannelFilter(e.target.value); resetPage(); }}
                            />
                        </div>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Status</label>
                            <select
                                className={cn("input-field", filterClasses.input)}
                                value={successFilter}
                                onChange={(e) => { setSuccessFilter(e.target.value); resetPage(); }}
                            >
                                <option value="">All</option>
                                <option value="true">Success</option>
                                <option value="false">Failed</option>
                            </select>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Action</label>
                            <select
                                className={cn("input-field", filterClasses.input)}
                                value={actionFilter}
                                onChange={(e) => { setActionFilter(e.target.value); resetPage(); }}
                            >
                                <option value="">All</option>
                                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div className={filterClasses.field}>
                            <label className={filterClasses.label}>Actor</label>
                            <input
                                type="text"
                                className={cn("input-field", filterClasses.input, "min-w-[120px]")}
                                placeholder="@username"
                                value={actorFilter}
                                onChange={(e) => { setActorFilter(e.target.value); resetPage(); }}
                            />
                        </div>
                    </>
                )}
                {hasFilters && (
                    <button onClick={clearFilters} className={filterClasses.clearBtn}>
                        Clear
                    </button>
                )}
            </FilterCard>

            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginBottom: "0.75rem" }}>
                {total > 0
                    ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
                    : "0 logs"}
            </p>

            <div className="card" style={{ padding: "0" }}>
                {(tab === "notifications" ? isLoading : actionsLoading) ? (
                    <TableSkeleton columns={tab === "actions" ? 5 : 7} rows={15} />
                ) : tab === "actions" ? (
                    actions.length === 0 ? (
                        <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                            {hasFilters ? "No logs match the filters." : "No action logs yet."}
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table className="table-dashboard">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Action</th>
                                        <th>Actor</th>
                                        <th>Target</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {actions.map((a) => (
                                        <tr key={a.id}>
                                            <td>
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                    <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                                    {formatDate(a.createdAt)}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: "6px", background: "rgba(191,90,242,0.15)", color: "#BF5AF2" }}>
                                                    {ACTION_LABELS[a.action] || a.action}
                                                </span>
                                            </td>
                                            <td>@{a.actorUsername}</td>
                                            <td style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>{a.targetType || "—"}</td>
                                            <td style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={a.details || ""}>{a.details || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : logs.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                        {hasFilters ? "No logs match the filters." : "No notification logs yet. Logs appear when alerts are sent."}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="table-dashboard">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Type</th>
                                    <th>Keyword</th>
                                    <th>Source</th>
                                    <th>Recipient</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                                {formatDate(log.createdAt)}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    fontWeight: 600,
                                                    padding: "0.2rem 0.5rem",
                                                    borderRadius: "6px",
                                                    background: log.type === "global" ? "rgba(191,90,242,0.15)" : "rgba(0,163,255,0.15)",
                                                    color: log.type === "global" ? "#BF5AF2" : "#00A3FF",
                                                }}
                                            >
                                                {log.type}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="keyword-badge">{log.keyword}</span>
                                        </td>
                                        <td style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)" }}>
                                            {log.sourceChannel}
                                        </td>
                                        <td>
                                            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                                <User size={14} color="rgba(255,255,255,0.4)" />
                                                @{log.recipient}
                                            </span>
                                        </td>
                                        <td>
                                            {log.success ? (
                                                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#00FF75" }}>
                                                    <CheckCircle size={14} />
                                                    Sent
                                                </span>
                                            ) : (
                                                <span
                                                    style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#FF4545", cursor: "help" }}
                                                    title={log.errorMessage ? `Error: ${log.errorMessage}` : "Delivery failed"}
                                                >
                                                    <XCircle size={14} />
                                                    Failed
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                                                {log.alertId && (
                                                    <Link
                                                        href={`/dashboard/archive/${log.alertId}`}
                                                        className="btn-link"
                                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                                    >
                                                        View <ExternalLink size={12} />
                                                    </Link>
                                                )}
                                                {log.postLink && (
                                                    <a
                                                        href={log.postLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn-link"
                                                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                                    >
                                                        Post
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", marginTop: "1rem" }}>
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        style={{
                            padding: "0.35rem 0.6rem",
                            fontSize: "0.8rem",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "6px",
                            color: page <= 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                            cursor: page <= 1 ? "not-allowed" : "pointer",
                        }}
                    >
                        ←
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let p: number;
                        if (totalPages <= 5) p = i + 1;
                        else if (page <= 3) p = i + 1;
                        else if (page >= totalPages - 2) p = totalPages - 4 + i;
                        else p = page - 2 + i;
                        return (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                style={{
                                    padding: "0.35rem 0.6rem",
                                    fontSize: "0.8rem",
                                    minWidth: "32px",
                                    background: page === p ? "rgba(0,163,255,0.2)" : "rgba(255,255,255,0.05)",
                                    border: `1px solid ${page === p ? "rgba(0,163,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                                    borderRadius: "6px",
                                    color: page === p ? "#00A3FF" : "rgba(255,255,255,0.7)",
                                    cursor: "pointer",
                                }}
                            >
                                {p}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        style={{
                            padding: "0.35rem 0.6rem",
                            fontSize: "0.8rem",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "6px",
                            color: page >= totalPages ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                            cursor: page >= totalPages ? "not-allowed" : "pointer",
                        }}
                    >
                        →
                    </button>
                </div>
            )}
        </div>
    );
}
