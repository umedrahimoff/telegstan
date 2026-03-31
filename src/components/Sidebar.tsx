"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Radio, Hash, Globe, Bell, Archive, FileText, Settings, Users, LogOut } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { data: me } = useSWR<{ role: string }>("/api/auth/me", fetcher);

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
        } catch {
            router.push("/login");
        }
    };

    const baseLinks = [
        { name: "Overview", icon: <LayoutDashboard size={18} />, href: "/dashboard" },
        { name: "Channels", icon: <Radio size={18} />, href: "/dashboard/channels" },
        { name: "Keywords", icon: <Hash size={18} />, href: "/dashboard/keywords" },
        { name: "Global Keywords", icon: <Globe size={18} />, href: "/dashboard/global-keywords" },
        { name: "Alerts", icon: <Bell size={18} />, href: "/dashboard/alerts" },
        { name: "Archive", icon: <Archive size={18} />, href: "/dashboard/archive" },
        { name: "Logs", icon: <FileText size={18} />, href: "/dashboard/logs" },
    ];
    const adminLinks =
        me?.role === "admin"
            ? [
                  { name: "Users", icon: <Users size={18} />, href: "/dashboard/users" },
                  { name: "Settings", icon: <Settings size={18} />, href: "/dashboard/settings" },
              ]
            : [];
    const links = [...baseLinks, ...adminLinks];

    return (
        <aside className="glass" style={{
            width: '240px',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            zIndex: 100
        }}>
            <div style={{ padding: '0 0.5rem' }}>
                <h1 style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    background: 'linear-gradient(45deg, #00A3FF, #00D1FF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '0.5rem'
                }}>
                    TGStan
                </h1>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                    {process.env.NEXT_PUBLIC_APP_VERSION || "v1.0.0"}
                </p>
            </div>

            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {links.map((link) => (
                    <Link
                        key={link.name}
                        href={link.href}
                        className={`card`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.6rem 0.85rem',
                            textDecoration: 'none',
                            color: (pathname === link.href || (link.href === "/dashboard/archive" && pathname.startsWith(link.href)) || (link.href === "/dashboard/channels" && pathname.startsWith(link.href)) || (link.href === "/dashboard/keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/global-keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/logs" && pathname.startsWith(link.href)) || (link.href === "/dashboard/users" && pathname.startsWith(link.href)) || (link.href === "/dashboard/settings" && pathname.startsWith(link.href))) ? 'white' : 'rgba(255,255,255,0.6)',
                            background: (pathname === link.href || (link.href === "/dashboard/archive" && pathname.startsWith(link.href)) || (link.href === "/dashboard/channels" && pathname.startsWith(link.href)) || (link.href === "/dashboard/keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/global-keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/logs" && pathname.startsWith(link.href)) || (link.href === "/dashboard/users" && pathname.startsWith(link.href)) || (link.href === "/dashboard/settings" && pathname.startsWith(link.href))) ? 'rgba(255,255,255,0.08)' : 'transparent',
                            borderColor: (pathname === link.href || (link.href === "/dashboard/archive" && pathname.startsWith(link.href)) || (link.href === "/dashboard/channels" && pathname.startsWith(link.href)) || (link.href === "/dashboard/keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/global-keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/logs" && pathname.startsWith(link.href)) || (link.href === "/dashboard/users" && pathname.startsWith(link.href)) || (link.href === "/dashboard/settings" && pathname.startsWith(link.href))) ? 'rgba(255,255,255,0.15)' : 'transparent',
                            fontWeight: (pathname === link.href || (link.href === "/dashboard/archive" && pathname.startsWith(link.href)) || (link.href === "/dashboard/channels" && pathname.startsWith(link.href)) || (link.href === "/dashboard/keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/global-keywords" && pathname.startsWith(link.href)) || (link.href === "/dashboard/logs" && pathname.startsWith(link.href)) || (link.href === "/dashboard/users" && pathname.startsWith(link.href)) || (link.href === "/dashboard/settings" && pathname.startsWith(link.href))) ? 600 : 400,
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {link.icon}
                        {link.name}
                    </Link>
                ))}
            </nav>

            <button
                onClick={handleLogout}
                className="card"
                style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.6rem 0.85rem',
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.85rem',
                    fontWeight: 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                }}
            >
                <LogOut size={18} />
                Log Out
            </button>
        </aside>
    );
}
