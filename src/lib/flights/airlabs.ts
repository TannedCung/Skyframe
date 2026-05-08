import type { FlightProvider, FlightSearchParams, FlightOption, FlightLeg } from "./types";
import logger from "@/lib/logger";

const AIRLABS_BASE_URL = "https://airlabs.co/api/v9/schedules";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface AirlabsSchedule {
  airline_iata: string;
  flight_iata: string;
  flight_number: string;
  dep_iata: string;
  dep_terminal: string | null;
  dep_time: string; // local time: "2026-05-08 23:20"
  dep_time_utc: string;
  arr_iata: string;
  arr_terminal: string | null;
  arr_time: string; // local time: "2026-05-09 06:30"
  arr_time_utc: string;
  duration: number; // minutes
  status: string;
  cs_airline_iata: string | null; // null = operating carrier, non-null = codeshare
  delayed: number | null;
}

interface AirlabsResponse {
  response: AirlabsSchedule[];
  error?: { message: string } | null;
}

export class AirlabsFlightProvider implements FlightProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    const outbound = await this.fetchSchedules(params.origin, params.destination);
    if (!outbound.length) return [];

    const inboundFlights: AirlabsSchedule[] = params.roundTrip
      ? await this.fetchSchedules(params.destination, params.origin)
      : [];

    const flights = this.buildFlightOptions(outbound, inboundFlights, params.roundTrip);

    if (params.preferenceFlightTime !== "any") {
      return flights.filter((f) =>
        params.preferenceFlightTime === "day" ? f.isDayFlight : !f.isDayFlight,
      );
    }

    return flights;
  }

  private async fetchSchedules(depIata: string, arrIata: string): Promise<AirlabsSchedule[]> {
    const url = new URL(AIRLABS_BASE_URL);
    url.searchParams.set("dep_iata", depIata);
    url.searchParams.set("arr_iata", arrIata);
    url.searchParams.set("api_key", this.apiKey);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url.toString());

        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error("AirLabs API rate limit exceeded");
        }

        if (!response.ok) {
          throw new Error(`AirLabs API error: ${response.status}`);
        }

        const data = (await response.json()) as AirlabsResponse;

        if (data.error) {
          throw new Error(`AirLabs API error: ${data.error.message}`);
        }

        // Only keep operating carriers (cs_airline_iata === null) to avoid duplicates
        return (data.response ?? []).filter((s) => s.cs_airline_iata === null);
      } catch (error) {
        logger.warn({ attempt, depIata, arrIata, error }, "AirLabs API attempt failed");
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    return [];
  }

  private buildFlightOptions(
    outbound: AirlabsSchedule[],
    inbound: AirlabsSchedule[],
    roundTrip: boolean,
  ): FlightOption[] {
    return outbound.map((out): FlightOption => {
      const depHour = parseLocalHour(out.dep_time);
      const isDayFlight = depHour >= 6 && depHour < 20;

      const outboundLeg: FlightLeg = {
        departureTime: toIsoLike(out.dep_time),
        arrivalTime: toIsoLike(out.arr_time),
        airline: out.airline_iata,
        flightNumber: out.flight_iata,
        from: out.dep_iata,
        to: out.arr_iata,
      };

      let inboundLeg: FlightLeg | undefined;
      if (roundTrip && inbound.length > 0) {
        // Pair with the first inbound flight (same airline preferred)
        const paired = inbound.find((i) => i.airline_iata === out.airline_iata) ?? inbound[0]!;
        inboundLeg = {
          departureTime: toIsoLike(paired.dep_time),
          arrivalTime: toIsoLike(paired.arr_time),
          airline: paired.airline_iata,
          flightNumber: paired.flight_iata,
          from: paired.dep_iata,
          to: paired.arr_iata,
        };
      }

      return {
        provider: "airlabs",
        price: 0,
        currency: "USD",
        priceAvailable: false,
        outbound: outboundLeg,
        inbound: inboundLeg,
        bookingLink: `https://www.${out.airline_iata.toLowerCase()}.com`,
        isDayFlight,
      };
    });
  }
}

/** Parse "2026-05-08 23:20" → hour as number (23) */
function parseLocalHour(localTime: string): number {
  const timePart = localTime.split(" ")[1] ?? "00:00";
  return parseInt(timePart.split(":")[0] ?? "0", 10);
}

/** Convert "2026-05-08 23:20" to ISO-like "2026-05-08T23:20:00" */
function toIsoLike(localTime: string): string {
  return localTime.replace(" ", "T") + ":00";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
