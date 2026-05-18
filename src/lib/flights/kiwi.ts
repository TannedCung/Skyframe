import type { FlightProvider, FlightSearchParams, FlightOption, FlightLeg } from "./types";
import logger from "@/lib/logger";

const KIWI_BASE_URL = "https://api.tequila.kiwi.com/v2/search";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface KiwiRoute {
  flyFrom: string;
  flyTo: string;
  local_departure: string;
  local_arrival: string;
  airline: string;
  flight_no: number;
}

interface KiwiResult {
  id: string;
  price: number;
  currency: string;
  utc_departure: string;
  airlines: string[];
  route: KiwiRoute[];
  deep_link: string;
}

interface KiwiResponse {
  data: KiwiResult[];
  currency: string;
}

export class KiwiTequilaFlightProvider implements FlightProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    const url = this.buildUrl(params);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { apikey: this.apiKey },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error("Kiwi API rate limit exceeded");
        }

        if (!response.ok) {
          throw new Error(`Kiwi API error: ${response.status}`);
        }

        const data = (await response.json()) as KiwiResponse;
        const results = this.mapResults(data, params);

        if (params.preferenceFlightTime !== "any") {
          return results.filter((f) =>
            params.preferenceFlightTime === "day" ? f.isDayFlight : !f.isDayFlight,
          );
        }

        return results;
      } catch (error) {
        logger.warn({ attempt, err: error }, "Kiwi API attempt failed");
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    return [];
  }

  private buildUrl(params: FlightSearchParams): URL {
    const url = new URL(KIWI_BASE_URL);
    url.searchParams.set("fly_from", params.origin);
    url.searchParams.set("fly_to", params.destination);
    url.searchParams.set("date_from", params.dateFrom);
    url.searchParams.set("date_to", params.dateTo);
    url.searchParams.set("flight_type", params.roundTrip ? "round" : "oneway");
    url.searchParams.set("curr", "USD");
    url.searchParams.set("limit", "10");

    if (params.roundTrip && params.returnFrom && params.returnTo) {
      url.searchParams.set("return_from", params.returnFrom);
      url.searchParams.set("return_to", params.returnTo);
    }

    if (params.preferenceCheapest) {
      url.searchParams.set("sort", "price");
    }

    if (params.maxStops !== undefined) {
      url.searchParams.set("max_stopovers", String(params.maxStops));
    }

    return url;
  }

  private mapResults(data: KiwiResponse, params: FlightSearchParams): FlightOption[] {
    return data.data.map((result): FlightOption => {
      const outboundRoutes = params.roundTrip
        ? result.route.slice(0, Math.ceil(result.route.length / 2))
        : result.route;
      const inboundRoutes = params.roundTrip
        ? result.route.slice(Math.ceil(result.route.length / 2))
        : [];

      const firstLeg = outboundRoutes[0];
      const lastOutbound = outboundRoutes[outboundRoutes.length - 1];

      // Parse hour directly from the local time string (HH in position 11–13)
      // to avoid timezone conversion issues — local_departure is airport-local time.
      const departureHour = parseInt((firstLeg?.local_departure ?? "T00").slice(11, 13), 10);
      const isDayFlight = departureHour >= 6 && departureHour < 20;

      const outbound: FlightLeg = {
        departureTime: firstLeg?.local_departure ?? "",
        arrivalTime: lastOutbound?.local_arrival ?? "",
        airline: firstLeg?.airline ?? "",
        flightNumber: `${firstLeg?.airline ?? ""}${firstLeg?.flight_no ?? ""}`,
        from: firstLeg?.flyFrom ?? "",
        to: lastOutbound?.flyTo ?? "",
      };

      let inbound: FlightLeg | undefined;
      if (inboundRoutes.length > 0) {
        const firstInbound = inboundRoutes[0];
        const lastInbound = inboundRoutes[inboundRoutes.length - 1];
        inbound = {
          departureTime: firstInbound?.local_departure ?? "",
          arrivalTime: lastInbound?.local_arrival ?? "",
          airline: firstInbound?.airline ?? "",
          flightNumber: `${firstInbound?.airline ?? ""}${firstInbound?.flight_no ?? ""}`,
          from: firstInbound?.flyFrom ?? "",
          to: lastInbound?.flyTo ?? "",
        };
      }

      return {
        provider: "kiwi",
        price: result.price,
        currency: data.currency,
        priceAvailable: true,
        outbound,
        inbound,
        bookingLink: result.deep_link,
        isDayFlight,
      };
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
