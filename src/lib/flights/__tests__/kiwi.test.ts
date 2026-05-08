/**
 * @jest-environment node
 */
import { KiwiTequilaFlightProvider } from "../kiwi";

const provider = new KiwiTequilaFlightProvider("test-api-key");

const baseParams = {
  origin: "HAN",
  destination: "NRT",
  dateFrom: "2025-03-01",
  dateTo: "2025-03-01",
  roundTrip: false,
  preferenceCheapest: true,
  preferenceFlightTime: "any" as const,
};

const mockKiwiResponse = {
  data: [
    {
      id: "mock-flight-1",
      price: 450,
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
      deep_link: "https://www.kiwi.com/booking?token=mock",
    },
  ],
  currency: "USD",
};

function mockFetch(responseBody: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(responseBody),
  } as unknown as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("KiwiTequilaFlightProvider", () => {
  it("maps Kiwi API response to FlightOption", async () => {
    mockFetch(mockKiwiResponse);

    const flights = await provider.searchFlights(baseParams);

    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      provider: "kiwi",
      price: 450,
      currency: "USD",
      bookingLink: expect.stringContaining("kiwi.com"),
    });
    expect(flights[0]?.outbound.from).toBe("HAN");
    expect(flights[0]?.outbound.to).toBe("NRT");
  });

  it("filters day flights when preferenceFlightTime is 'day'", async () => {
    mockFetch({
      data: [
        {
          id: "night-flight",
          price: 300,
          currency: "USD",
          utc_departure: "2025-03-01T22:00:00Z",
          airlines: ["VN"],
          route: [
            {
              flyFrom: "HAN",
              flyTo: "NRT",
              local_departure: "2025-03-01T23:00:00Z",
              local_arrival: "2025-03-02T07:00:00Z",
              airline: "VN",
              flight_no: 51,
            },
          ],
          deep_link: "https://www.kiwi.com/booking?token=night",
        },
      ],
      currency: "USD",
    });

    const flights = await provider.searchFlights({ ...baseParams, preferenceFlightTime: "day" });
    expect(flights).toHaveLength(0);
  });

  it("filters night flights when preferenceFlightTime is 'night'", async () => {
    mockFetch(mockKiwiResponse); // 13:00 local departure = day flight
    const flights = await provider.searchFlights({ ...baseParams, preferenceFlightTime: "night" });
    expect(flights).toHaveLength(0);
  });

  it("retries on 429 and eventually succeeds", async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve({ ok: false, status: 429, json: jest.fn() } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockKiwiResponse),
      } as unknown as Response);
    });

    const flights = await provider.searchFlights(baseParams);
    expect(flights).toHaveLength(1);
    expect(callCount).toBe(2);
  }, 10000);

  it("builds round-trip URL params correctly", async () => {
    let capturedUrl = "";
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [], currency: "USD" }),
      } as unknown as Response);
    });

    await provider.searchFlights({
      ...baseParams,
      roundTrip: true,
      returnFrom: "2025-03-10",
      returnTo: "2025-03-10",
    });

    expect(capturedUrl).toContain("flight_type=round");
    expect(capturedUrl).toContain("return_from=2025-03-10");
  });

  it("includes apikey header in request", async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = opts?.headers as Record<string, string>;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [], currency: "USD" }),
      } as unknown as Response);
    });

    await provider.searchFlights(baseParams);
    expect(capturedHeaders["apikey"]).toBe("test-api-key");
  });
});
