/**
 * Integration smoke: verifies VietJetAirFlightProvider resolves token from the
 * local token service and executes a real VietJet flight search.
 *
 * Usage (token service must be running on :3001):
 *   npx tsx scripts/test-vietjet-provider.ts
 */
import { VietJetAirFlightProvider } from "../src/lib/flights/vietjet";
import type { FlightSearchParams } from "../src/lib/flights/types";

async function main() {
  const provider = new VietJetAirFlightProvider({
    serviceUrl: "http://localhost:3001",
    serviceSecret: "dev-secret",
  });

  const params: FlightSearchParams = {
    origin: "HAN",
    destination: "SGN",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-01",
    roundTrip: false,
    preferenceCheapest: true,
    preferenceFlightTime: "any",
  };

  console.log(`Searching ${params.origin} → ${params.destination} on ${params.dateFrom}...`);
  const results = await provider.searchFlights(params);

  if (results.length === 0) {
    console.log("No flights returned — route/date may be unavailable.");
    return;
  }

  const r = results[0]!;
  console.log(`\nProvider:  ${r.provider}`);
  console.log(`Price:     ${r.currency} ${r.price.toLocaleString()}`);
  console.log(`Available: ${r.priceAvailable}`);
  console.log(`Route:     ${r.outbound.from} → ${r.outbound.to}`);
  console.log(`Departs:   ${r.outbound.departureTime}`);
  console.log(`Arrives:   ${r.outbound.arrivalTime}`);
  console.log(`Flight:    ${r.outbound.flightNumber}`);
  console.log(`Booking:   ${r.bookingLink.slice(0, 90)}...`);
  console.log("\nFull chain verified: token service → WAF token → VietJet API → result");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
