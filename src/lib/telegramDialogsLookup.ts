import type { TelegramClient } from "telegram";

/** Per folder (main + archived); keeps API route within typical serverless time limits. */
const DIALOG_SCAN_LIMIT = 1500;

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
 * Scans main chats and archived (folders 0 and 1), up to DIALOG_SCAN_LIMIT per pass.
 */
export async function findEntityByUsernameInDialogs(client: TelegramClient, username: string): Promise<unknown | null> {
    const normalized = username.replace(/^@/, "").toLowerCase();

    for (const archived of [false, true]) {
        for await (const d of client.iterDialogs({ limit: DIALOG_SCAN_LIMIT, archived })) {
            const hit = matchUsername(d, normalized);
            if (hit) return hit;
        }
    }

    return null;
}
