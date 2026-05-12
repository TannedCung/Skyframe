import { sql } from "../client";
import type { User, UserPreferences, GdsProvider } from "@/types";

export async function upsertUser(data: {
  email: string;
  name?: string | null;
  googleId?: string | null;
}): Promise<User> {
  const rows = await sql`
    INSERT INTO users (email, name, google_id)
    VALUES (${data.email}, ${data.name ?? null}, ${data.googleId ?? null})
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      google_id = COALESCE(EXCLUDED.google_id, users.google_id)
    RETURNING id, email, name, google_id, notification_email, default_currency, timezone, gds_provider, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to upsert user");
  return rowToUser(row);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`
    SELECT id, email, name, google_id, notification_email, default_currency, timezone, gds_provider, created_at
    FROM users WHERE email = ${email}
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await sql`
    SELECT id, email, name, google_id, notification_email, default_currency, timezone, gds_provider, created_at
    FROM users WHERE id = ${id}
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function updateUserPreferences(id: string, prefs: UserPreferences): Promise<User> {
  const rows = await sql`
    UPDATE users
    SET notification_email = ${prefs.notificationEmail},
        default_currency   = ${prefs.defaultCurrency},
        timezone           = ${prefs.timezone},
        gds_provider       = ${prefs.gdsProvider}
    WHERE id = ${id}
    RETURNING id, email, name, google_id, notification_email, default_currency, timezone, gds_provider, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("User not found");
  return rowToUser(row);
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: (row["name"] as string | null) ?? null,
    googleId: (row["google_id"] as string | null) ?? null,
    notificationEmail: (row["notification_email"] as boolean) ?? true,
    defaultCurrency: (row["default_currency"] as string) ?? "USD",
    timezone: (row["timezone"] as string) ?? "UTC",
    gdsProvider: (row["gds_provider"] as GdsProvider | null) ?? "auto",
    createdAt: new Date(row["created_at"] as string),
  };
}
