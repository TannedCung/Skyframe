import type { FlightProvider, FlightSearchParams, FlightOption } from "./types";
import logger from "@/lib/logger";

const MAX_RETRIES = 2;

interface ServiceSearchResult {
  flights: FlightOption[];
  capturedAt: string;
}

/**
 * Google Flights provider — thin HTTP client.
 *
 * The actual scraping (Chrome TLS impersonation via `impers` + libcurl-impersonate)
 * lives in `services/google-flights-worker/` and runs on Railway/Fly.io. We can't
 * run native FFI on Vercel's Lambda runtime, so we proxy to a small always-on
 * worker that handles the scraping and serves cached results back.
 */
export class GoogleFlightsProvider implements FlightProvider {
  private readonly serviceUrl: string;
  private readonly serviceSecret: string;

  constructor(opts: { serviceUrl: string; serviceSecret: string }) {
    this.serviceUrl = opts.serviceUrl.replace(/\/$/, "");
    this.serviceSecret = opts.serviceSecret;
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.serviceUrl}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.serviceSecret}`,
          },
          body: JSON.stringify({
            origin: params.origin,
            destination: params.destination,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            roundTrip: params.roundTrip,
            maxStops: params.maxStops,
            preferenceCheapest: params.preferenceCheapest,
            preferenceFlightTime: params.preferenceFlightTime,
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
          throw new Error(`Google Flights worker returned ${res.status}`);
        }

        const data = (await res.json()) as ServiceSearchResult;
        logger.debug(
          { count: data.flights?.length ?? 0 },
          "Google Flights worker search succeeded",
        );
        return data.flights ?? [];
      } catch (err) {
        logger.warn({ attempt, err }, "Google Flights worker call failed");
        if (attempt === MAX_RETRIES) throw err;
      }
    }

    return [];
  }
}
