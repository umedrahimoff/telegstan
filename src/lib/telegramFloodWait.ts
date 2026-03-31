import { FloodWaitError } from "telegram/errors";

/** Seconds until Telegram allows the same RPC again (FLOOD_WAIT). */
export function parseTelegramFloodWaitSeconds(err: unknown): number | null {
    if (err instanceof FloodWaitError && typeof err.seconds === "number") {
        return err.seconds;
    }
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.match(/A wait of (\d+) seconds is required/i);
    if (m) return parseInt(m[1], 10);
    return null;
}

export function formatHumanDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "a few seconds";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
}
