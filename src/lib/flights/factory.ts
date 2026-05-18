import { AirlabsFlightProvider } from "./airlabs";
import { GoogleFlightsProvider } from "./google";
import { KiwiTequilaFlightProvider } from "./kiwi";
import { VietJetAirFlightProvider } from "./vietjet";
import type { FlightProvider, FlightSearchParams, FlightOption } from "./types";
import type { GdsProvider } from "@/types";
import { Errors } from "@/lib/errors";
import logger from "@/lib/logger";

/** Shared worker URL + secret for both Google and VietJet providers. */
function getFlightsWorkerConfig(): { serviceUrl: string; serviceSecret: string } | null {
  const url = process.env["FLIGHTS_SERVICE_URL"];
  const secret = process.env["FLIGHTS_SERVICE_SECRET"];
  if (!url || !secret) return null;
  return { serviceUrl: url, serviceSecret: secret };
}

/** Tries AirLabs (primary) then Kiwi (fallback). */
class CompositeFlightProvider implements FlightProvider {
  private readonly providers: Array<{ name: string; provider: FlightProvider }>;

  constructor(providers: Array<{ name: string; provider: FlightProvider }>) {
    this.providers = providers;
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    for (const { name, provider } of this.providers) {
      try {
        const results = await provider.searchFlights(params);
        if (results.length > 0) {
          logger.debug({ provider: name, count: results.length }, "Flight search succeeded");
          return results;
        }
        logger.warn({ provider: name }, "Flight provider returned no results, trying next");
      } catch (error) {
        logger.warn({ provider: name, err: error }, "Flight provider failed, trying next");
      }
    }
    return [];
  }
}

let _provider: CompositeFlightProvider | null = null;

export function getFlightProvider(): CompositeFlightProvider {
  if (_provider) return _provider;

  const chain: Array<{ name: string; provider: FlightProvider }> = [];

  // Kiwi first: returns real prices and booking links.
  // AirLabs fallback: schedule data only, no prices.
  const kiwiKey = process.env["KIWI_API_KEY"];
  if (kiwiKey) {
    chain.push({ name: "kiwi", provider: new KiwiTequilaFlightProvider(kiwiKey) });
  }

  // VietJet + Google Flights share a single worker service on Railway.
  // VietJet: real prices in VND via headless browser (Playwright).
  // Google Flights: real prices via Chrome TLS impersonation (impers/FFI).
  const worker = getFlightsWorkerConfig();
  if (worker) {
    chain.push({
      name: "vietjet",
      provider: new VietJetAirFlightProvider({
        serviceUrl: worker.serviceUrl,
        serviceSecret: worker.serviceSecret,
      }),
    });
    chain.push({
      name: "google",
      provider: new GoogleFlightsProvider({
        serviceUrl: worker.serviceUrl,
        serviceSecret: worker.serviceSecret,
      }),
    });
  }

  const airlabsKey = process.env["AIRLABS_API_KEY"];
  if (airlabsKey) {
    chain.push({ name: "airlabs", provider: new AirlabsFlightProvider(airlabsKey) });
  }

  if (chain.length === 0) {
    throw new Error("No flight provider configured: set AIRLABS_API_KEY or KIWI_API_KEY");
  }

  _provider = new CompositeFlightProvider(chain);
  return _provider;
}

/** Reset singleton — useful in tests. */
export function resetFlightProvider(): void {
  _provider = null;
}

/**
 * Returns a single-provider instance matching the user's GDS preference.
 * Falls back to the composite chain for 'auto'.
 * Does NOT cache — call site should be per-request.
 */
export function getFlightProviderForUser(pref: GdsProvider): FlightProvider {
  if (pref === "auto") return getFlightProvider();

  if (pref === "kiwi") {
    const key = process.env["KIWI_API_KEY"];
    if (!key) throw Errors.serviceUnavailable("Kiwi Tequila (KIWI_API_KEY not set)");
    return new KiwiTequilaFlightProvider(key);
  }

  if (pref === "vietjet") {
    const worker = getFlightsWorkerConfig();
    if (!worker)
      throw Errors.serviceUnavailable("Flights worker (FLIGHTS_SERVICE_URL/SECRET not set)");
    return new VietJetAirFlightProvider({
      serviceUrl: worker.serviceUrl,
      serviceSecret: worker.serviceSecret,
    });
  }

  if (pref === "airlabs") {
    const key = process.env["AIRLABS_API_KEY"];
    if (!key) throw Errors.serviceUnavailable("AirLabs (AIRLABS_API_KEY not set)");
    return new AirlabsFlightProvider(key);
  }

  if (pref === "google") {
    const worker = getFlightsWorkerConfig();
    if (!worker)
      throw Errors.serviceUnavailable("Flights worker (FLIGHTS_SERVICE_URL/SECRET not set)");
    return new GoogleFlightsProvider({
      serviceUrl: worker.serviceUrl,
      serviceSecret: worker.serviceSecret,
    });
  }

  return getFlightProvider();
}
