import type { TelegramClient } from "telegram";

/** Full dialogs scan (all folders) with a practical upper bound. */
const DIALOG_SCAN_LIMIT = 5000;

function matchUsername(d: { isChannel: boolean; isGroup: boolean; entity?: unknown }, normalized: string): unknown | null {
    if (!d.isChannel && !d.isGroup) return null;
    const e = d.entity as { username?: string } | undefined;
    const u = e?.username;
    if (u && String(u).toLowerCase() === normalized && d.entity) return d.entity;
    return null;
}

/**
 * Find a channel/group entity by @username from already-known dialogs only.
 * Avoids contacts.ResolveUsername (used by getEntity(@username)) when Telegram returns FLOOD_WAIT.
 * Scans all dialogs (folder: undefined), including archived/folders, up to DIALOG_SCAN_LIMIT.
 */
export async function findEntityByUsernameInDialogs(client: TelegramClient, username: string): Promise<unknown | null> {
    const normalized = username.replace(/^@/, "").toLowerCase();
    for await (const d of client.iterDialogs({ limit: DIALOG_SCAN_LIMIT })) {
        const hit = matchUsername(d, normalized);
        if (hit) return hit;
    }

    return null;
}
