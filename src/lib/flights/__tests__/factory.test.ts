/**
 * @jest-environment node
 */
import { resetFlightProvider, getFlightProvider } from "../factory";

const baseParams = {
  origin: "HAN",
  destination: "NRT",
  dateFrom: "2025-03-01",
  dateTo: "2025-03-01",
  roundTrip: false,
  preferenceCheapest: true,
  preferenceFlightTime: "any" as const,
};

beforeEach(() => resetFlightProvider());
afterEach(() => {
  jest.restoreAllMocks();
  resetFlightProvider();
});

describe("CompositeFlightProvider (factory)", () => {
  it("uses AirLabs when AIRLABS_API_KEY is set", () => {
    process.env["AIRLABS_API_KEY"] = "airlabs-key";
    delete process.env["KIWI_API_KEY"];

    // getFlightProvider should not throw
    expect(() => getFlightProvider()).not.toThrow();

    delete process.env["AIRLABS_API_KEY"];
  });

  it("uses Kiwi when only KIWI_API_KEY is set", () => {
    delete process.env["AIRLABS_API_KEY"];
    process.env["KIWI_API_KEY"] = "kiwi-key";

    expect(() => getFlightProvider()).not.toThrow();

    delete process.env["KIWI_API_KEY"];
  });

  it("throws when no keys are configured", () => {
    delete process.env["AIRLABS_API_KEY"];
    delete process.env["KIWI_API_KEY"];

    expect(() => getFlightProvider()).toThrow("No flight provider configured");
  });

  it("falls back to Kiwi when AirLabs returns empty results", async () => {
    process.env["AIRLABS_API_KEY"] = "airlabs-key";
    process.env["KIWI_API_KEY"] = "kiwi-key";

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("airlabs.co")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ response: [], error: null }),
        });
      }
      // Kiwi response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              id: "k1",
              price: 400,
              currency: "USD",
              utc_departure: "2025-03-01T06:00:00Z",
              airlines: ["VN"],
              route: [
                {
                  flyFrom: "HAN",
                  flyTo: "NRT",
                  local_departure: "2025-03-01T13:00:00Z",
                  local_arrival: "2025-03-01T21:00:00Z",
                  airline: "VN",
                  flight_no: 50,
                },
              ],
              deep_link: "https://kiwi.com/book",
            },
          ],
          currency: "USD",
        }),
      });
    });

    const provider = getFlightProvider();
    const flights = await provider.searchFlights(baseParams);

    expect(flights).toHaveLength(1);
    expect(flights[0]?.provider).toBe("kiwi");
    expect(callCount).toBeGreaterThanOrEqual(2);

    delete process.env["AIRLABS_API_KEY"];
    delete process.env["KIWI_API_KEY"];
  });

  it("falls back to Kiwi when AirLabs throws", async () => {
    process.env["AIRLABS_API_KEY"] = "airlabs-key";
    process.env["KIWI_API_KEY"] = "kiwi-key";

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("airlabs.co")) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              id: "k1",
              price: 400,
              currency: "USD",
              utc_departure: "2025-03-01T06:00:00Z",
              airlines: ["VN"],
              route: [
                {
                  flyFrom: "HAN",
                  flyTo: "NRT",
                  local_departure: "2025-03-01T13:00:00Z",
                  local_arrival: "2025-03-01T21:00:00Z",
                  airline: "VN",
                  flight_no: 50,
                },
              ],
              deep_link: "https://kiwi.com/book",
            },
          ],
          currency: "USD",
        }),
      });
    });

    const provider = getFlightProvider();
    const flights = await provider.searchFlights(baseParams);

    expect(flights).toHaveLength(1);
    expect(flights[0]?.provider).toBe("kiwi");

    delete process.env["AIRLABS_API_KEY"];
    delete process.env["KIWI_API_KEY"];
  }, 15000);

  it("returns empty array when all providers fail", async () => {
    process.env["AIRLABS_API_KEY"] = "airlabs-key";
    delete process.env["KIWI_API_KEY"];

    global.fetch = jest.fn().mockRejectedValue(new Error("Network down"));

    const provider = getFlightProvider();
    const flights = await provider.searchFlights(baseParams);

    expect(flights).toHaveLength(0);

    delete process.env["AIRLABS_API_KEY"];
  }, 15000);
});
