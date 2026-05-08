import { sql } from "../client";
import type { Notification, NotificationType, TripWatcher } from "@/types";

export async function createNotification(data: {
  tripId: string;
  watcherEmail: string;
  type: NotificationType;
  payloadJson: Record<string, unknown>;
}): Promise<Notification> {
  const rows = await sql`
    INSERT INTO notifications (trip_id, watcher_email, type, payload_json)
    VALUES (${data.tripId}, ${data.watcherEmail}, ${data.type}, ${JSON.stringify(data.payloadJson)})
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to create notification");
  return rowToNotification(row);
}

export async function getUnsentNotifications(): Promise<Notification[]> {
  const rows = await sql`
    SELECT * FROM notifications
    WHERE sent_at IS NULL
    ORDER BY created_at ASC
    LIMIT 100
  `;
  return rows.map(rowToNotification);
}

export async function markNotificationSent(id: string): Promise<void> {
  await sql`UPDATE notifications SET sent_at = NOW() WHERE id = ${id}`;
}

export async function upsertWatcher(data: {
  tripId: string;
  email: string;
  role?: "owner" | "viewer";
}): Promise<TripWatcher> {
  const rows = await sql`
    INSERT INTO trip_watchers (trip_id, email, role)
    VALUES (${data.tripId}, ${data.email}, ${data.role ?? "viewer"})
    ON CONFLICT (trip_id, email) DO NOTHING
    RETURNING *
  `;
  if (rows[0]) return rowToWatcher(rows[0]);

  const existing = await sql`
    SELECT * FROM trip_watchers WHERE trip_id = ${data.tripId} AND email = ${data.email}
  `;
  const row = existing[0];
  if (!row) throw new Error("Failed to upsert watcher");
  return rowToWatcher(row);
}

export async function getWatchersByTrip(tripId: string): Promise<TripWatcher[]> {
  const rows = await sql`
    SELECT * FROM trip_watchers WHERE trip_id = ${tripId}
  `;
  return rows.map(rowToWatcher);
}

export async function getWatcherByInviteToken(token: string): Promise<TripWatcher | null> {
  const rows = await sql`
    SELECT * FROM trip_watchers WHERE invite_token = ${token}
  `;
  return rows[0] ? rowToWatcher(rows[0]) : null;
}

export async function acceptInvite(inviteToken: string): Promise<void> {
  await sql`
    UPDATE trip_watchers
    SET invite_accepted_at = NOW()
    WHERE invite_token = ${inviteToken} AND invite_accepted_at IS NULL
  `;
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row["id"] as string,
    tripId: row["trip_id"] as string,
    watcherEmail: row["watcher_email"] as string,
    type: row["type"] as NotificationType,
    payloadJson: row["payload_json"] as Record<string, unknown>,
    sentAt: row["sent_at"] ? new Date(row["sent_at"] as string) : null,
  };
}

function rowToWatcher(row: Record<string, unknown>): TripWatcher {
  return {
    id: row["id"] as string,
    tripId: row["trip_id"] as string,
    email: row["email"] as string,
    role: row["role"] as "owner" | "viewer",
    inviteToken: row["invite_token"] as string,
    inviteAcceptedAt: row["invite_accepted_at"]
      ? new Date(row["invite_accepted_at"] as string)
      : null,
    createdAt: new Date(row["created_at"] as string),
  };
}
