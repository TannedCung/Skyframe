import { AirlabsFlightProvider } from "./airlabs";
import { KiwiTequilaFlightProvider } from "./kiwi";
import type { FlightProvider, FlightSearchParams, FlightOption } from "./types";
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
