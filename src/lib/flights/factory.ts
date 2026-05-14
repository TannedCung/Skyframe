import { AirlabsFlightProvider } from "./airlabs";
import { GoogleFlightsProvider } from "./google";
import { KiwiTequilaFlightProvider } from "./kiwi";
import { VietJetAirFlightProvider } from "./vietjet";
import type { FlightProvider, FlightSearchParams, FlightOption } from "./types";
import type { GdsProvider } from "@/types";
import { Errors } from "@/lib/errors";
import logger from "@/lib/logger";

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
        logger.warn({ provider: name, error }, "Flight provider failed, trying next");
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

  // VietJet: real prices in VND via a headless browser search service.
  // Deploy services/vietjet-token-server/ and set both env vars to enable.
  const vietjetServiceUrl = process.env["VIETJET_TOKEN_SERVICE_URL"];
  const vietjetServiceSecret = process.env["VIETJET_TOKEN_SERVICE_SECRET"];
  if (vietjetServiceUrl && vietjetServiceSecret) {
    chain.push({
      name: "vietjet",
      provider: new VietJetAirFlightProvider({
        serviceUrl: vietjetServiceUrl,
        serviceSecret: vietjetServiceSecret,
      }),
    });
  }

  // Google Flights: real prices via Chrome TLS impersonation behind an external
  // worker (services/google-flights-worker/, deployed on Railway/Fly).
  // Placed after Kiwi/VietJet (which have booking links), before AirLabs.
  const googleServiceUrl = process.env["GOOGLE_FLIGHTS_SERVICE_URL"];
  const googleServiceSecret = process.env["GOOGLE_FLIGHTS_SERVICE_SECRET"];
  if (googleServiceUrl && googleServiceSecret) {
    chain.push({
      name: "google",
      provider: new GoogleFlightsProvider({
        serviceUrl: googleServiceUrl,
        serviceSecret: googleServiceSecret,
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
    const url = process.env["VIETJET_TOKEN_SERVICE_URL"];
    const secret = process.env["VIETJET_TOKEN_SERVICE_SECRET"];
    if (!url || !secret)
      throw Errors.serviceUnavailable("VietJet token service (env vars not set)");
    return new VietJetAirFlightProvider({ serviceUrl: url, serviceSecret: secret });
  }

  if (pref === "airlabs") {
    const key = process.env["AIRLABS_API_KEY"];
    if (!key) throw Errors.serviceUnavailable("AirLabs (AIRLABS_API_KEY not set)");
    return new AirlabsFlightProvider(key);
  }

  if (pref === "google") {
    const url = process.env["GOOGLE_FLIGHTS_SERVICE_URL"];
    const secret = process.env["GOOGLE_FLIGHTS_SERVICE_SECRET"];
    if (!url || !secret)
      throw Errors.serviceUnavailable(
        "Google Flights worker (GOOGLE_FLIGHTS_SERVICE_URL/SECRET not set)",
      );
    return new GoogleFlightsProvider({ serviceUrl: url, serviceSecret: secret });
  }

  return getFlightProvider();
}
