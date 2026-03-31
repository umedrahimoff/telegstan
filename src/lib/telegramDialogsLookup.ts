import type { TelegramClient } from "telegram";

/**
 * Find a channel/group entity by @username from already-known dialogs only.
 * Avoids contacts.ResolveUsername (used by getEntity(@username)) when Telegram returns FLOOD_WAIT.
 */
export async function findEntityByUsernameInDialogs(client: TelegramClient, username: string): Promise<unknown | null> {
    const normalized = username.replace(/^@/, "").toLowerCase();
    const dialogs = await client.getDialogs({ limit: 500 });
    for (const d of dialogs) {
        if (!d.isChannel && !d.isGroup) continue;
        const e = d.entity as { username?: string } | undefined;
        const u = e?.username;
        if (u && String(u).toLowerCase() === normalized && d.entity) {
            return d.entity;
        }
    }
    return null;
}
