import { sql } from "../client";

export interface PersistedChatMessage {
  id: string;
  tripId: string;
  role: "user" | "model";
  content: string;
  createdAt: Date;
}

export async function getMessagesForTrip(tripId: string): Promise<PersistedChatMessage[]> {
  const rows = await sql`
    SELECT id, trip_id, role, content, created_at
    FROM chat_messages
    WHERE trip_id = ${tripId}
    ORDER BY created_at ASC, id ASC
  `;
  return rows.map((row) => ({
    id: row["id"] as string,
    tripId: row["trip_id"] as string,
    role: row["role"] as "user" | "model",
    content: row["content"] as string,
    createdAt: new Date(row["created_at"] as string),
  }));
}

export async function appendChatMessage(
  tripId: string,
  role: "user" | "model",
  content: string,
): Promise<void> {
  await sql`
    INSERT INTO chat_messages (trip_id, role, content)
    VALUES (${tripId}, ${role}, ${content})
  `;
}
