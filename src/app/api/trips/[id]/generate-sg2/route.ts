import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTripById } from "@/lib/db/queries/trips";
import {
  createItinerary,
  getNextVersion,
  supersedePreviousItineraries,
} from "@/lib/db/queries/itineraries";
import { sql } from "@/lib/db/client";
import { callLLM, parseJsonFromLLM } from "@/lib/llm/provider";
import { SG2_SYSTEM_PROMPT, buildSG2UserPrompt } from "@/lib/llm/prompts/sg2";
import { getFlightProvider } from "@/lib/flights/factory";
import { apiError, Errors } from "@/lib/errors";
import type { SG1Option } from "@/types";
import type { FlightSearchParams } from "@/lib/flights/types";
import type { SG2Response } from "@/lib/llm/prompts/sg2";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const trip = await getTripById(id);
    if (!trip) return apiError(Errors.notFound("Trip"));

    const userId = (session.user as { id?: string }).id;
    if (trip.userId !== userId) return apiError(Errors.forbidden());

    const body = (await request.json()) as { sg1OptionId?: string };
    if (!body.sg1OptionId) return apiError(Errors.badRequest("sg1OptionId is required"));

    // sg1OptionId is the LLM-assigned id inside llm_raw_plan_json, not the DB UUID
    const optRows = await sql`
      SELECT * FROM trip_raw_options
      WHERE trip_id = ${id} AND llm_raw_plan_json->>'id' = ${body.sg1OptionId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!optRows[0]) return apiError(Errors.notFound("SG1 option"));

    const sg1Option = optRows[0]["llm_raw_plan_json"] as SG1Option;

    // Fetch flights from Kiwi
    const flightParams: FlightSearchParams = {
      origin: trip.originAirport,
      destination: sg1Option.airports.entry,
      dateFrom: sg1Option.approximateDates.start,
      dateTo: sg1Option.approximateDates.start,
      roundTrip: trip.tripType === "round_trip",
      returnFrom: trip.tripType === "round_trip" ? sg1Option.approximateDates.end : undefined,
      returnTo: trip.tripType === "round_trip" ? sg1Option.approximateDates.end : undefined,
      preferenceCheapest: trip.preferenceCheapest,
      preferenceFlightTime: trip.preferenceFlightTime,
    };

    const flights = await getFlightProvider().searchFlights(flightParams);
    if (!flights.length)
      return apiError(Errors.serviceUnavailable("Flight search returned no results"));

    // Generate SG2 itinerary via LLM
    const rawText = await callLLM(SG2_SYSTEM_PROMPT, buildSG2UserPrompt(trip, sg1Option, flights));
    const parsed = parseJsonFromLLM<SG2Response>(rawText);

    const bestFlight = flights[0]!;
    const version = await getNextVersion(id);
    const itinerary = await createItinerary({
      tripId: id,
      version,
      itineraryJson: parsed.days,
      snapshotFlightDataJson: {
        outbound: bestFlight.outbound,
        inbound: bestFlight.inbound,
        totalPrice: bestFlight.priceAvailable ? (parsed.totalPrice ?? bestFlight.price) : 0,
        currency: parsed.currency ?? bestFlight.currency,
        bookingLink: bestFlight.bookingLink,
        provider: bestFlight.provider,
        priceAvailable: bestFlight.priceAvailable,
      },
      cheapestTotalPrice: bestFlight.priceAvailable ? (parsed.totalPrice ?? bestFlight.price) : 0,
      currency: parsed.currency ?? bestFlight.currency,
    });

    await supersedePreviousItineraries(id, itinerary.id);

    // Mark SG1 option as selected
    await sql`UPDATE trip_raw_options SET selected = TRUE WHERE trip_id = ${id} AND llm_raw_plan_json->>'id' = ${body.sg1OptionId}`;

    return NextResponse.json({ itinerary }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
