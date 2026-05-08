import { sql } from "../client";
import type { User } from "@/types";

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
    RETURNING id, email, name, google_id, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to upsert user");
  return rowToUser(row);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`
    SELECT id, email, name, google_id, created_at
    FROM users WHERE email = ${email}
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    name: (row["name"] as string | null) ?? null,
    googleId: (row["google_id"] as string | null) ?? null,
    createdAt: new Date(row["created_at"] as string),
  };
}
