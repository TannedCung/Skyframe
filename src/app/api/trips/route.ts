import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createTrip, getTripsByUser } from "@/lib/db/queries/trips";
import { upsertWatcher } from "@/lib/db/queries/notifications";
import { validateIata } from "@/lib/iata";
import { apiError, Errors } from "@/lib/errors";
import type { FlightTimePreference, TripType } from "@/types";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const userId = (session.user as { id?: string }).id;
    if (!userId) return apiError(Errors.unauthorized());

    const trips = await getTripsByUser(userId);
    return NextResponse.json({ trips });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const userId = (session.user as { id?: string }).id;
    if (!userId) return apiError(Errors.unauthorized());

    const body = (await request.json()) as {
      title?: string;
      originAirport?: string;
      destinationCity?: string;
      destinationCountry?: string;
      startDate?: string;
      endDate?: string;
      flexibilityDays?: number;
      preferenceCheapest?: boolean;
      preferenceFlightTime?: FlightTimePreference;
      tripType?: TripType;
    };

    if (!body.title) return apiError(Errors.badRequest("title is required"));
    if (!body.originAirport) return apiError(Errors.badRequest("originAirport is required"));
    if (!body.startDate) return apiError(Errors.badRequest("startDate is required"));
    if (!body.endDate) return apiError(Errors.badRequest("endDate is required"));

    validateIata(body.originAirport, "originAirport");

    const trip = await createTrip({
      userId,
      title: body.title,
      originAirport: body.originAirport,
      destinationCity: body.destinationCity,
      destinationCountry: body.destinationCountry,
      startDate: body.startDate,
      endDate: body.endDate,
      flexibilityDays: body.flexibilityDays,
      preferenceCheapest: body.preferenceCheapest,
      preferenceFlightTime: body.preferenceFlightTime,
      tripType: body.tripType,
    });

    // Add creator as owner watcher
    await upsertWatcher({ tripId: trip.id, email: session.user.email, role: "owner" });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
