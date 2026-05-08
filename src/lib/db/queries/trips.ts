import { sql } from "../client";
import type { Trip, TripStatus, TripType, FlightTimePreference } from "@/types";

export interface CreateTripInput {
  userId: string;
  title: string;
  originAirport: string;
  destinationCity?: string;
  destinationCountry?: string;
  startDate: string;
  endDate: string;
  flexibilityDays?: number;
  preferenceCheapest?: boolean;
  preferenceFlightTime?: FlightTimePreference;
  tripType?: TripType;
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const rows = await sql`
    INSERT INTO trips (
      user_id, title, origin_airport, destination_city, destination_country,
      start_date, end_date, flexibility_days, preference_cheapest,
      preference_flight_time, trip_type
    ) VALUES (
      ${input.userId}, ${input.title}, ${input.originAirport},
      ${input.destinationCity ?? null}, ${input.destinationCountry ?? null},
      ${input.startDate}, ${input.endDate},
      ${input.flexibilityDays ?? 0}, ${input.preferenceCheapest ?? true},
      ${input.preferenceFlightTime ?? "any"}, ${input.tripType ?? "round_trip"}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to create trip");
  return rowToTrip(row);
}

export async function getTripsByUser(userId: string): Promise<Trip[]> {
  const rows = await sql`
    SELECT * FROM trips
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToTrip);
}

export async function getTripById(id: string): Promise<Trip | null> {
  const rows = await sql`SELECT * FROM trips WHERE id = ${id}`;
  return rows[0] ? rowToTrip(rows[0]) : null;
}

export async function updateTripStatus(id: string, status: TripStatus): Promise<void> {
  await sql`UPDATE trips SET status = ${status} WHERE id = ${id}`;
}

export async function updateLastFlightRefresh(id: string): Promise<void> {
  await sql`UPDATE trips SET last_flight_refresh_at = NOW() WHERE id = ${id}`;
}

export async function getActiveTripsForRefresh(): Promise<Trip[]> {
  const rows = await sql`
    SELECT t.* FROM trips t
    WHERE t.status = 'active'
      AND EXISTS (
        SELECT 1 FROM itineraries i
        WHERE i.trip_id = t.id AND i.status = 'current'
      )
      AND (
        t.last_flight_refresh_at IS NULL
        OR t.last_flight_refresh_at < NOW() - INTERVAL '55 minutes'
      )
  `;
  return rows.map(rowToTrip);
}

export async function deleteTrip(id: string, userId: string): Promise<void> {
  await sql`DELETE FROM trips WHERE id = ${id} AND user_id = ${userId}`;
}

function rowToTrip(row: Record<string, unknown>): Trip {
  return {
    id: row["id"] as string,
    userId: row["user_id"] as string,
    title: row["title"] as string,
    originAirport: row["origin_airport"] as string,
    destinationCity: (row["destination_city"] as string | null) ?? null,
    destinationCountry: (row["destination_country"] as string | null) ?? null,
    startDate: new Date(row["start_date"] as string),
    endDate: new Date(row["end_date"] as string),
    flexibilityDays: row["flexibility_days"] as number,
    preferenceCheapest: row["preference_cheapest"] as boolean,
    preferenceFlightTime: row["preference_flight_time"] as FlightTimePreference,
    tripType: row["trip_type"] as TripType,
    status: row["status"] as TripStatus,
    lastFlightRefreshAt: row["last_flight_refresh_at"]
      ? new Date(row["last_flight_refresh_at"] as string)
      : null,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
  };
}
