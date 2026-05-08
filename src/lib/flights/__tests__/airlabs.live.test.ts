/**
 * @jest-environment node
 */
// Live integration test — requires AIRLABS_API_KEY in environment.
// Skipped automatically when the key is absent.
import { AirlabsFlightProvider } from "../airlabs";

const apiKey = process.env["AIRLABS_API_KEY"];
const describeIf = apiKey ? describe : describe.skip;

describeIf("AirlabsFlightProvider (live)", () => {
  const provider = new AirlabsFlightProvider(apiKey ?? "");

  it("returns real flights for HAN→NRT", async () => {
    const flights = await provider.searchFlights({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-10",
      roundTrip: false,
      preferenceCheapest: true,
      preferenceFlightTime: "any",
    });

    console.log(`Live AirLabs: ${flights.length} flights returned`);
    if (flights.length > 0) {
      const f = flights[0]!;
      console.log(
        `  First: ${f.outbound.airline} ${f.outbound.flightNumber} ${f.outbound.from}→${f.outbound.to}`,
      );
      console.log(`  Departs: ${f.outbound.departureTime} | isDayFlight: ${f.isDayFlight}`);
      console.log(`  priceAvailable: ${f.priceAvailable} | provider: ${f.provider}`);
    }

    expect(Array.isArray(flights)).toBe(true);
    if (flights.length > 0) {
      const f = flights[0]!;
      expect(f.provider).toBe("airlabs");
      expect(f.priceAvailable).toBe(false);
      expect(f.price).toBe(0);
      expect(f.outbound.from).toBe("HAN");
      expect(f.outbound.to).toBe("NRT");
      expect(f.outbound.departureTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    }
  }, 20000);

  it("returns round-trip flights for HAN⇄NRT", async () => {
    const flights = await provider.searchFlights({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-05-10",
      dateTo: "2026-05-17",
      roundTrip: true,
      preferenceCheapest: true,
      preferenceFlightTime: "any",
    });

    console.log(`Live AirLabs round-trip: ${flights.length} flights returned`);
    expect(Array.isArray(flights)).toBe(true);
    if (flights.length > 0) {
      expect(flights[0]!.inbound).toBeDefined();
      expect(flights[0]!.inbound?.from).toBe("NRT");
      expect(flights[0]!.inbound?.to).toBe("HAN");
    }
  }, 20000);
});
