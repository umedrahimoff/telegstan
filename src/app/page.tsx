import Link from "next/link";
import { Shield, Zap, Search, Bell } from "lucide-react";

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-glow" />
      <div className="landing-card">
        <div className="landing-hero">
          <span className="landing-badge">Elite Telegram Monitoring</span>
          <h1 className="landing-title">Telegstan</h1>
          <p className="landing-desc">
            Track channels, set keywords, and get instant alerts in Telegram. Supports English and Russian.
          </p>
        </div>

        <div className="landing-features">
          {[
            { icon: Shield, label: "Human Auth", color: "#00A3FF" },
            { icon: Zap, label: "Instant News", color: "#FFD600" },
            { icon: Search, label: "Smart Filters", color: "#00FF94" },
            { icon: Bell, label: "Push Alerts", color: "#FF5C00" },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="landing-feature">
                <Icon size={18} color={f.color} />
                <span>{f.label}</span>
              </div>
            );
          })}
        </div>

        <Link href="/dashboard" className="landing-cta">
          Enter Dashboard
        </Link>
      </div>

      <div className="landing-footer">
        MTProto Engine &bull; Vercel &bull; Industrial Grade
      </div>
    </div>
  );
}
