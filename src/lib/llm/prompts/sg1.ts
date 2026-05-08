import type { Trip } from "@/types";
import type { SG1Option } from "@/types";

export const SG1_SYSTEM_PROMPT = `You are an expert travel planner.
Given trip parameters, generate 3-5 high-level trip options as structured JSON.
Each option must have entry/exit cities, approximate date ranges, a theme, and airport codes.
Always respond with valid JSON only — no explanation, no markdown.`;

export function buildSG1UserPrompt(trip: Trip): string {
  return `Generate trip options for:
- Origin airport: ${trip.originAirport}
- Destination: ${trip.destinationCity ?? trip.destinationCountry ?? "flexible"}
- Travel window: ${trip.startDate.toISOString().split("T")[0]} to ${trip.endDate.toISOString().split("T")[0]}
- Flexibility: ±${trip.flexibilityDays} days
- Trip type: ${trip.tripType}
- Preference: ${trip.preferenceCheapest ? "cheapest option" : "best experience"}, ${trip.preferenceFlightTime} flights

Respond with JSON in this exact format:
{
  "options": [
    {
      "id": "opt-1",
      "entryCity": "Tokyo",
      "exitCity": "Osaka",
      "approximateDates": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "theme": "food & culture",
      "airports": { "entry": "NRT", "exit": "KIX" },
      "description": "One sentence summary"
    }
  ]
}`;
}

export interface SG1Response {
  options: SG1Option[];
}
