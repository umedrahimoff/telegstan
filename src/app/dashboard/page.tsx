"use client";

import { useState, useCallback } from "react";
import { Activity, Bell, Radio, Hash, ArrowUpRight, BarChart3, Eye, PieChart, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { FilterCard, filterClasses } from "@/components/FilterCard";
import { cn } from "@/lib/cn";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { formatDate } from "@/lib/date";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
} from "recharts";

const chartTooltipStyle = {
    background: "#1a1a2e",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
};

type Period = "all" | "24h" | "3d" | "7d" | "30d";

interface Stats {
    totalAlerts: number;
    totalPostsScanned: number;
    totalPostsSaved?: number;
    activeChannels: number;
    activeKeywords: number;
    systemHealth: string;
    matchRate?: number;
    deliveryRate?: number;
    channelsAdded?: number;
    periodComparison?: { current: number; previous: number; changePercent: number } | null;
    alertsBySource?: { name: string; value: number; fill: string }[];
    keywordsByChannel?: { channelName: string; keywords: { keyword: string; count: number }[] }[];
    recentAlerts: any[];
    alertsByWeek: { week: string; count: number }[];
    alertsByChannel: { name: string; count: number }[];
    alertsByKeyword: { keyword: string; count: number }[];
    alertsByDay: { day: string; count: number }[];
    lastScan: { date: string; count: number } | null;
}

function DashboardSkeleton() {
    return (
        <div className="animate-fade">
            <div style={{ marginBottom: "1.5rem" }}>
                <div className="skeleton" style={{ width: "160px", height: "1.5rem", marginBottom: "0.5rem" }} />
                <div className="skeleton" style={{ width: "320px", maxWidth: "100%", height: "0.9rem" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="card" style={{ padding: "1rem" }}>
                        <div className="skeleton" style={{ width: "40px", height: "40px", borderRadius: "10px", marginBottom: "0.75rem" }} />
                        <div className="skeleton" style={{ width: "60%", height: "1.25rem", marginBottom: "0.35rem" }} />
                        <div className="skeleton" style={{ width: "80%", height: "0.8rem" }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: "24h", label: "24 hours" },
    { value: "3d", label: "3 days" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "Month" },
    { value: "all", label: "All time" },
];

function MiniSparkline({ data, color }: { data: { day: string; count: number }[]; color: string }) {
    if (!data?.length) return null;
    const max = Math.max(...data.map((d) => d.count), 1);
    return (
        <div style={{ height: 28, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="count" stroke={color} fill={`url(#spark-${color.replace("#", "")})`} strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function ChartExportButton({ chartId, title }: { chartId: string; title: string }) {
    const handleExport = useCallback(async () => {
        const el = document.getElementById(chartId);
        if (!el) return;
        try {
            const { default: html2canvas } = await import("html2canvas");
            const canvas = await html2canvas(el, { backgroundColor: "#0D0E12", scale: 2 });
            const link = document.createElement("a");
            link.download = `${title.replace(/\s/g, "-")}-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch {
            console.warn("Export failed");
        }
    }, [chartId, title]);
    return (
        <button onClick={handleExport} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }} title="Export PNG">
            <Download size={14} />
        </button>
    );
}

export default function Dashboard() {
    const [period, setPeriod] = useState<Period>("7d");
    const [channelFilter, setChannelFilter] = useState<string>("");
    const [keywordFilter, setKeywordFilter] = useState<string>("");
    const statsKey = period === "all" ? "/api/stats" : `/api/stats?period=${period}`;
    const { data: stats, error, isLoading, mutate } = useSWR<Stats>(statsKey, fetcher, { refreshInterval: 60000 });

    const archiveUrl = [channelFilter && `channel=${encodeURIComponent(channelFilter)}`, keywordFilter && `keyword=${encodeURIComponent(keywordFilter)}`].filter(Boolean).join("&");
    const archiveHref = `/dashboard/archive${archiveUrl ? `?${archiveUrl}` : ""}`;

    if (isLoading || error || !stats) {
        return <DashboardSkeleton />;
    }

    const cards = [
        { title: "Posts Scanned", value: (stats.totalPostsScanned ?? 0).toLocaleString(), icon: Eye, color: "#00D1FF", sparkline: stats.alertsByDay },
        { title: "Total Alerts", value: stats.totalAlerts, icon: Bell, color: "#00A3FF", sparkline: stats.alertsByDay },
        { title: "Active Channels", value: stats.activeChannels, icon: Radio, color: "#00FF75" },
        { title: "Keywords", value: stats.activeKeywords, icon: Hash, color: "#BF5AF2" },
        { title: "Posts Saved", value: (stats.totalPostsSaved ?? 0).toLocaleString(), icon: BarChart3, color: "#FF9F0A" },
        { title: "Match Rate", value: `${stats.matchRate ?? 0}%`, icon: Activity, color: "#00A3FF" },
        { title: "Delivery Rate", value: `${stats.deliveryRate ?? 100}%`, icon: Bell, color: "#00FF75" },
        { title: "Channels Added", value: stats.channelsAdded ?? 0, icon: Radio, color: "#BF5AF2" },
    ];

    return (
        <div className="animate-fade" style={{ width: "100%" }}>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.25rem" }}>Overview</h1>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem" }}>Performance overview of your TGStan monitoring network.</p>
            </div>

            {stats.periodComparison && stats.periodComparison.previous > 0 && (
                <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "rgba(0,163,255,0.08)", borderRadius: 12, border: "1px solid rgba(0,163,255,0.2)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.8)" }}>
                        vs previous period: <strong style={{ color: stats.periodComparison.changePercent >= 0 ? "#00FF75" : "#FF5C5C" }}>{stats.periodComparison.changePercent >= 0 ? "+" : ""}{stats.periodComparison.changePercent.toFixed(1)}%</strong> alerts
                    </span>
                </div>
            )}

            <FilterCard>
                <div className={filterClasses.field}>
                    <label className={filterClasses.label}>Channel</label>
                    <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className={cn("input-field", filterClasses.input)}>
                        <option value="">All channels</option>
                        {(stats.alertsByChannel ?? []).map((c) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className={filterClasses.field}>
                    <label className={filterClasses.label}>Keyword</label>
                    <select value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} className={cn("input-field", filterClasses.input)}>
                        <option value="">All keywords</option>
                        {(stats.alertsByKeyword ?? []).map((k) => (
                            <option key={k.keyword} value={k.keyword}>{k.keyword}</option>
                        ))}
                    </select>
                </div>
                <div className={filterClasses.field}>
                    <label className={filterClasses.label}>Period</label>
                    <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={cn("input-field", filterClasses.input)}>
                        {PERIOD_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                {(channelFilter || keywordFilter) && (
                    <Link href={archiveHref} style={{ fontSize: "0.8rem", color: "#00A3FF", fontWeight: 600, display: "flex", alignItems: "center", alignSelf: "flex-end" }}>
                        View filtered →
                    </Link>
                )}
                <div className={filterClasses.actions} style={{ marginLeft: "auto" }}>
                    <button onClick={() => mutate()} className={filterClasses.clearBtn} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </FilterCard>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                {cards.map((card) => (
                    <div key={card.title} className="card" style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                            <div style={{ background: `${card.color}20`, padding: "0.4rem", borderRadius: 8 }}>
                                <card.icon color={card.color} size={18} />
                            </div>
                        </div>
                        <div style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.1rem" }}>{card.value}</div>
                        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{card.title}</div>
                        {card.sparkline && <MiniSparkline data={card.sparkline} color={card.color} />}
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                <div id="chart-week" className="card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <BarChart3 size={18} color="#00A3FF" />
                            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Posts per day</h2>
                        </div>
                        <ChartExportButton chartId="chart-week" title="Posts per day" />
                    </div>
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.alertsByDay ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | undefined) => [v ?? 0, "Posts"]} labelFormatter={(l) => l} />
                                <Bar dataKey="count" fill="#00A3FF" radius={[4, 4, 0, 0]} maxBarSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div id="chart-day" className="card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Activity size={18} color="#00FF75" />
                            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>{period === "24h" ? "Alerts by hour" : "Alerts by day"}</h2>
                        </div>
                        <ChartExportButton chartId="chart-day" title="Alerts by day" />
                    </div>
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stats.alertsByDay ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} allowDecimals={false} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | undefined) => [v ?? 0, "Alerts"]} labelFormatter={(l) => l} />
                                <Line type="monotone" dataKey="count" stroke="#00FF75" strokeWidth={2} dot={{ fill: "#00FF75", r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: (stats.alertsBySource?.length ?? 0) > 0 ? "1fr 1fr" : "1fr", gap: "1rem", marginBottom: "1rem" }}>
                {(stats.alertsBySource?.length ?? 0) > 0 && (
                    <div id="chart-source" className="card" style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <PieChart size={18} color="#BF5AF2" />
                                <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Alerts by source</h2>
                            </div>
                            <ChartExportButton chartId="chart-source" title="Alerts by source" />
                        </div>
                        <div style={{ width: "100%", height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                    <Pie data={stats.alertsBySource} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                                        {(stats.alertsBySource ?? []).map((entry, i) => (
                                            <Cell key={i} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | undefined) => [v ?? 0, "Alerts"]} />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
                <SystemStatusCard />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                <div id="chart-channels" className="card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Radio size={18} color="#BF5AF2" />
                            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Top channels</h2>
                        </div>
                        <ChartExportButton chartId="chart-channels" title="Top channels" />
                    </div>
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.alertsByChannel ?? []} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} width={100} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | undefined) => [v ?? 0, "Alerts"]} />
                                <Bar dataKey="count" fill="#BF5AF2" radius={[0, 4, 4, 0]} maxBarSize={20} cursor="pointer" onClick={(data: { payload?: { name?: string } }) => data?.payload?.name && (window.location.href = `/dashboard/archive?channel=${encodeURIComponent(data.payload.name)}`)} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div id="chart-keywords" className="card" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Hash size={18} color="#FF9F0A" />
                            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Top keywords</h2>
                        </div>
                        <ChartExportButton chartId="chart-keywords" title="Top keywords" />
                    </div>
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.alertsByKeyword ?? []} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} allowDecimals={false} />
                                <YAxis type="category" dataKey="keyword" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} width={100} />
                                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number | undefined) => [v ?? 0, "Alerts"]} />
                                <Bar dataKey="count" fill="#FF9F0A" radius={[0, 4, 4, 0]} maxBarSize={20} cursor="pointer" onClick={(data: { payload?: { keyword?: string } }) => data?.payload?.keyword && (window.location.href = `/dashboard/archive?keyword=${encodeURIComponent(data.payload.keyword)}`)} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                {(stats.keywordsByChannel?.length ?? 0) > 0 ? (
                    <div className="card" style={{ padding: "1rem" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Keywords by channel</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {(stats.keywordsByChannel ?? []).map((ch) => (
                                <div key={ch.channelName} style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                                    <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>{ch.channelName}</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        {ch.keywords.map((kw) => (
                                            <div key={kw.keyword} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                                                <span style={{ color: "#00A3FF" }}>{kw.keyword}</span> — {kw.count}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem" }}>Keywords by channel will appear when you have alerts.</span>
                    </div>
                )}
                <div className="card" style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Real-time Feed</h2>
                            <Link href="/dashboard/archive" style={{ fontSize: "0.8rem", color: "#00A3FF", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", textDecoration: "none" }}>
                                View All <ArrowUpRight size={14} />
                            </Link>
                        </div>
                        {stats.recentAlerts.length === 0 ? (
                            <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Add keywords to channels to start matching.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {stats.recentAlerts.map((alert) => (
                                    <Link
                                        key={alert.id}
                                        href={`/dashboard/archive/${alert.id}`}
                                        style={{
                                            padding: "0.9rem 1rem",
                                            background: "rgba(255,255,255,0.02)",
                                            borderRadius: "16px",
                                            border: "1px solid rgba(255,255,255,0.05)",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            textDecoration: "none",
                                            color: "inherit",
                                            cursor: "pointer",
                                            transition: "background 0.2s, border-color 0.2s",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                                            e.currentTarget.style.borderColor = "rgba(0,163,255,0.2)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{alert.channelName}</div>
                                            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>
                                                Matched: <span style={{ color: "#00A3FF" }}>{alert.matchedWord}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>{formatDate(alert.createdAt)}</div>
                                    </Link>
                                ))}
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}

function SystemStatusCard() {
    const { data: health } = useSWR<{ status: string; checks?: Record<string, { status: string; latencyMs?: number; error?: string }> }>("/api/health", fetcher);
    const dbOk = health?.checks?.database?.status === "ok";
    return (
        <div className="card" style={{ padding: "1rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>System Status</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dbOk ? "#00FF75" : "#FF5C5C", marginTop: "6px" }} />
                    <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>Database</div>
                        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>
                            {health?.checks?.database ? (dbOk ? `${health.checks.database.latencyMs}ms` : health.checks.database.error) : "Checking..."}
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: health?.status === "healthy" ? "#00FF75" : "rgba(255,255,255,0.2)", marginTop: "6px" }} />
                    <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>API</div>
                        <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>{health?.status === "healthy" ? "Healthy" : health?.status ?? "Checking..."}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
