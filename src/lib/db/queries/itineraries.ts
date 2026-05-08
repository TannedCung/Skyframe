import { sql } from "../client";
import type { Itinerary, DayItinerary, FlightSnapshot } from "@/types";

export interface CreateItineraryInput {
  tripId: string;
  version: number;
  parentVersionId?: string | null;
  itineraryJson: DayItinerary[];
  snapshotFlightDataJson: FlightSnapshot;
  cheapestTotalPrice: number;
  currency?: string;
}

export async function createItinerary(input: CreateItineraryInput): Promise<Itinerary> {
  const rows = await sql`
    INSERT INTO itineraries (
      trip_id, version, parent_version_id, itinerary_json,
      snapshot_flight_data_json, cheapest_total_price, currency
    ) VALUES (
      ${input.tripId}, ${input.version}, ${input.parentVersionId ?? null},
      ${JSON.stringify(input.itineraryJson)}, ${JSON.stringify(input.snapshotFlightDataJson)},
      ${input.cheapestTotalPrice}, ${input.currency ?? "USD"}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to create itinerary");
  return rowToItinerary(row);
}

export async function getCurrentItinerary(tripId: string): Promise<Itinerary | null> {
  const rows = await sql`
    SELECT * FROM itineraries
    WHERE trip_id = ${tripId} AND status = 'current'
    ORDER BY version DESC
    LIMIT 1
  `;
  return rows[0] ? rowToItinerary(rows[0]) : null;
}

export async function getItineraryHistory(tripId: string): Promise<Itinerary[]> {
  const rows = await sql`
    SELECT * FROM itineraries
    WHERE trip_id = ${tripId}
    ORDER BY version DESC
  `;
  return rows.map(rowToItinerary);
}

export async function supersedePreviousItineraries(
  tripId: string,
  currentId: string,
): Promise<void> {
  await sql`
    UPDATE itineraries
    SET status = 'superseded'
    WHERE trip_id = ${tripId} AND id != ${currentId}
  `;
}

export async function getNextVersion(tripId: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM itineraries WHERE trip_id = ${tripId}
  `;
  return (rows[0]?.["next_version"] as number) ?? 1;
}

function rowToItinerary(row: Record<string, unknown>): Itinerary {
  return {
    id: row["id"] as string,
    tripId: row["trip_id"] as string,
    version: row["version"] as number,
    parentVersionId: (row["parent_version_id"] as string | null) ?? null,
    status: row["status"] as "current" | "superseded",
    itineraryJson: row["itinerary_json"] as DayItinerary[],
    snapshotFlightDataJson: row["snapshot_flight_data_json"] as FlightSnapshot,
    cheapestTotalPrice: Number(row["cheapest_total_price"]),
    currency: row["currency"] as string,
    createdAt: new Date(row["created_at"] as string),
  };
}
