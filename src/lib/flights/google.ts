import type { FlightProvider, FlightSearchParams, FlightOption, FlightLeg } from "./types";
import { buildGoogleFilters, encodeGoogleFilters } from "./google-encoding";
import { parseGoogleFlightsResponse, type ParsedGoogleFlight } from "./google-parsing";
import logger from "@/lib/logger";

const FLIGHTS_URL =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?hl=en";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Google Flights provider using `impers` for Chrome TLS fingerprint impersonation.
 * No API key required — Google validates the TLS ClientHello, not a bearer token.
 *
 * Gracefully returns empty results when `impers` native module is unavailable
 * (e.g. Vercel Lambda), so the composite chain falls through to the next provider.
 */
export class GoogleFlightsProvider implements FlightProvider {
  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    // impers requires libcurl-impersonate (native FFI), unavailable on Vercel.
    // Return empty results so the composite chain falls through to the next provider.
    const impersModule = await import("impers").catch(() => null);
    if (!impersModule) {
      logger.warn("Google Flights skipped: impers native module not available");
      return [];
    }
    const { post } = impersModule;

    const filters = buildGoogleFilters({
      origin: params.origin,
      destination: params.destination,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      roundTrip: params.roundTrip,
      maxStops: params.maxStops,
      preferenceCheapest: params.preferenceCheapest,
      departAfter: params.preferenceFlightTime === "day" ? 6 : undefined,
      departBefore: params.preferenceFlightTime === "day" ? 20 : undefined,
    });

    const encoded = encodeGoogleFilters(filters);
    const body = `f.req=${encoded}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await post(FLIGHTS_URL, {
          impersonate: "chrome146",
          data: body,
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": CHROME_UA,
            referer: "https://www.google.com/travel/flights",
          },
          timeout: 20_000,
        });

        if (res.status === 403) throw new Error("Google Flights blocked (403)");
        if (res.status === 429) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error("Google Flights rate limit exceeded");
        }
        if (res.status !== 200) throw new Error(`Google Flights error: HTTP ${res.status}`);

        const parsed = parseGoogleFlightsResponse(res.text);
        const results = parsed.map(mapToFlightOption);

        if (params.preferenceFlightTime !== "any") {
          return results.filter((f) =>
            params.preferenceFlightTime === "day" ? f.isDayFlight : !f.isDayFlight,
          );
        }

        logger.debug({ count: results.length }, "Google Flights search succeeded");
        return results;
      } catch (error) {
        logger.warn({ attempt, error }, "Google Flights attempt failed");
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    return [];
  }
}

function mapToFlightOption(f: ParsedGoogleFlight): FlightOption {
  const outbound: FlightLeg = {
    departureTime: f.segments[0]?.departureTime ?? f.departureTime,
    arrivalTime: f.segments[0]?.arrivalTime ?? f.arrivalTime,
    airline: f.segments[0]?.airline ?? f.airline,
    flightNumber: f.segments[0]?.flightNumber ?? f.flightNumber,
    from: f.segments[0]?.from ?? f.departureAirport,
    to: f.segments[0]?.to ?? f.arrivalAirport,
  };

  // For round-trip flights Google returns separate itineraries per direction,
  // so we only populate outbound here (the caller merges them).
  const inbound: FlightLeg | undefined =
    f.segments.length > 1
      ? {
          departureTime: f.segments[1]?.departureTime ?? "",
          arrivalTime: f.segments[1]?.arrivalTime ?? "",
          airline: f.segments[1]?.airline ?? "",
          flightNumber: f.segments[1]?.flightNumber ?? "",
          from: f.segments[1]?.from ?? "",
          to: f.segments[1]?.to ?? "",
        }
      : undefined;

  return {
    provider: "google",
    price: f.price,
    currency: f.currency,
    priceAvailable: true,
    outbound,
    inbound,
    bookingLink: `https://www.google.com/travel/flights?q=flights+from+${f.departureAirport}+to+${f.arrivalAirport}`,
    isDayFlight: f.isDayFlight,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
