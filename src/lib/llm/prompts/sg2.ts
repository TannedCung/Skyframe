import type { SG1Option, DayItinerary } from "@/types";
import type { FlightOption } from "@/lib/flights/types";
import type { Trip } from "@/types";

export const SG2_SYSTEM_PROMPT = `You are an expert travel itinerary planner.
Given a high-level trip plan and actual flight options, create a detailed day-by-day itinerary.
Align activities with flight arrival/departure times on travel days.
Respond with valid JSON only — no markdown, no explanation.`;

export function buildSG2UserPrompt(
  trip: Trip,
  sg1Option: SG1Option,
  flights: FlightOption[],
): string {
  const topFlight = flights[0];
  return `Create a detailed day-by-day itinerary based on:

TRIP:
${JSON.stringify({ title: trip.title, tripType: trip.tripType, preferenceCheapest: trip.preferenceCheapest }, null, 2)}

HIGH-LEVEL PLAN (user selected):
${JSON.stringify(sg1Option, null, 2)}

AVAILABLE FLIGHTS (best ${flights.length} options):
${JSON.stringify(flights.slice(0, 3), null, 2)}

Using the ${
    topFlight
      ? topFlight.priceAvailable
        ? `flight priced at ${topFlight.price} ${topFlight.currency}`
        : `${topFlight.outbound.airline} flight ${topFlight.outbound.flightNumber} (price data not available — use 0 for totalPrice)`
      : "best available flight"
  }, create a day-by-day plan.

Respond in this exact JSON format:
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "location": "City name",
      "activities": ["Activity 1", "Activity 2"],
      "notes": "Any important notes (flight times, transit, etc.)"
    }
  ],
  "selectedFlight": { /* echo the chosen flight option */ },
  "totalPrice": 0,
  "currency": "USD"
}`;
}

export const SG2_UPDATE_SYSTEM_PROMPT = `You are an expert travel itinerary updater.
Given a previous itinerary and updated flight data, minimally adjust the itinerary.
Keep as much of the original plan as possible. Only change what the new flight data requires.
Respond with valid JSON only.`;

export function buildSG2UpdatePrompt(
  previousItinerary: DayItinerary[],
  previousPrice: number,
  newFlights: FlightOption[],
): string {
  const newFlight = newFlights[0];
  const priceSection = newFlight?.priceAvailable
    ? `PREVIOUS PRICE: ${previousPrice} USD\nPrice change: ${previousPrice} → ${newFlight.price} USD (${(((newFlight.price - previousPrice) / (previousPrice || 1)) * 100).toFixed(1)}% change)`
    : `NOTE: Price data is not available for these flights. Focus only on adjusting flight times.`;

  return `Update this itinerary with new flight data:

PREVIOUS ITINERARY:
${JSON.stringify(previousItinerary, null, 2)}

${priceSection}

NEW FLIGHT OPTIONS:
${JSON.stringify(newFlights.slice(0, 3), null, 2)}

Minimally adjust the itinerary for the new flight times. Return the same JSON structure as the original.`;
}

export interface SG2Response {
  days: DayItinerary[];
  selectedFlight: FlightOption;
  totalPrice: number;
  currency: string;
}
