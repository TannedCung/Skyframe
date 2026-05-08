/**
 * @jest-environment node
 */
import { AirlabsFlightProvider } from "../airlabs";

const provider = new AirlabsFlightProvider("test-api-key");

const baseParams = {
  origin: "HAN",
  destination: "NRT",
  dateFrom: "2025-03-01",
  dateTo: "2025-03-01",
  roundTrip: false,
  preferenceCheapest: true,
  preferenceFlightTime: "any" as const,
};

const mockSchedule = [
  {
    airline_iata: "VN",
    airline_icao: "HVN",
    flight_iata: "VN310",
    flight_icao: "HVN310",
    flight_number: "310",
    dep_iata: "HAN",
    dep_icao: "VVNB",
    dep_terminal: "2",
    dep_gate: null,
    dep_time: "2026-05-09 00:25",
    dep_time_utc: "2026-05-08 17:25",
    arr_iata: "NRT",
    arr_icao: "RJAA",
    arr_terminal: "1N",
    arr_gate: null,
    arr_baggage: null,
    arr_time: "2026-05-09 07:35",
    arr_time_utc: "2026-05-08 22:35",
    cs_airline_iata: null,
    cs_flight_number: null,
    cs_flight_iata: null,
    status: "scheduled",
    duration: 310,
    delayed: null,
    dep_delayed: null,
    arr_delayed: null,
    aircraft_icao: null,
    arr_time_ts: 1778279700,
    dep_time_ts: 1778261100,
  },
  {
    airline_iata: "JL",
    airline_icao: "JAL",
    flight_iata: "JL752",
    flight_icao: "JAL752",
    flight_number: "752",
    dep_iata: "HAN",
    dep_icao: "VVNB",
    dep_terminal: "T2",
    dep_gate: null,
    dep_time: "2026-05-08 23:20",
    dep_time_utc: "2026-05-08 16:20",
    arr_iata: "NRT",
    arr_icao: "RJAA",
    arr_terminal: "2",
    arr_gate: null,
    arr_baggage: null,
    arr_time: "2026-05-09 06:30",
    arr_time_utc: "2026-05-08 21:30",
    cs_airline_iata: null,
    cs_flight_number: null,
    cs_flight_iata: null,
    status: "scheduled",
    duration: 310,
    delayed: null,
    dep_delayed: null,
    arr_delayed: null,
    aircraft_icao: null,
    arr_time_ts: 1778275800,
    dep_time_ts: 1778257200,
  },
  // Codeshare — should be filtered out
  {
    airline_iata: "AS",
    airline_icao: "ASA",
    flight_iata: "AS7324",
    flight_number: "7324",
    dep_iata: "HAN",
    dep_terminal: "T2",
    dep_time: "2026-05-08 23:20",
    dep_time_utc: "2026-05-08 16:20",
    arr_iata: "NRT",
    arr_terminal: "2",
    arr_time: "2026-05-09 06:30",
    arr_time_utc: "2026-05-08 21:30",
    cs_airline_iata: "JL", // codeshare → must be excluded
    cs_flight_number: "752",
    cs_flight_iata: "JL752",
    status: "scheduled",
    duration: 310,
    delayed: null,
  },
];

function mockFetch(responseBody: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(responseBody),
  } as unknown as Response);
}

afterEach(() => jest.restoreAllMocks());

describe("AirlabsFlightProvider", () => {
  it("maps AirLabs response to FlightOption[]", async () => {
    mockFetch({ response: mockSchedule, error: null });

    const flights = await provider.searchFlights(baseParams);

    // Only operating carriers (cs_airline_iata === null): VN310 and JL752
    expect(flights).toHaveLength(2);
    expect(flights[0]?.provider).toBe("airlabs");
    expect(flights[0]?.priceAvailable).toBe(false);
    expect(flights[0]?.price).toBe(0);
  });

  it("filters out codeshare flights", async () => {
    mockFetch({ response: mockSchedule, error: null });

    const flights = await provider.searchFlights(baseParams);

    const airlines = flights.map((f) => f.outbound.airline);
    expect(airlines).not.toContain("AS"); // codeshare excluded
    expect(airlines).toContain("VN");
    expect(airlines).toContain("JL");
  });

  it("correctly maps departure and arrival times", async () => {
    mockFetch({ response: [mockSchedule[0]!], error: null });

    const flights = await provider.searchFlights(baseParams);

    expect(flights[0]?.outbound.departureTime).toBe("2026-05-09T00:25:00");
    expect(flights[0]?.outbound.arrivalTime).toBe("2026-05-09T07:35:00");
    expect(flights[0]?.outbound.from).toBe("HAN");
    expect(flights[0]?.outbound.to).toBe("NRT");
    expect(flights[0]?.outbound.flightNumber).toBe("VN310");
  });

  it("marks a 00:25 departure as a night flight", async () => {
    mockFetch({ response: [mockSchedule[0]!], error: null });

    const flights = await provider.searchFlights(baseParams);
    expect(flights[0]?.isDayFlight).toBe(false); // 00:25 < 06:00
  });

  it("marks a 10:00 departure as a day flight", async () => {
    const dayFlight = {
      ...mockSchedule[0]!,
      dep_time: "2026-05-09 10:00",
      arr_time: "2026-05-09 17:10",
      cs_airline_iata: null,
    };
    mockFetch({ response: [dayFlight], error: null });

    const flights = await provider.searchFlights(baseParams);
    expect(flights[0]?.isDayFlight).toBe(true);
  });

  it("filters day flights when preferenceFlightTime is 'day'", async () => {
    mockFetch({ response: mockSchedule, error: null });

    // Both VN310 (00:25) and JL752 (23:20) are night flights
    const flights = await provider.searchFlights({ ...baseParams, preferenceFlightTime: "day" });
    expect(flights).toHaveLength(0);
  });

  it("filters night flights when preferenceFlightTime is 'night'", async () => {
    const dayFlight = { ...mockSchedule[0]!, dep_time: "2026-05-09 10:00", cs_airline_iata: null };
    const nightFlight = {
      ...mockSchedule[1]!,
      dep_time: "2026-05-09 22:00",
      cs_airline_iata: null,
    };
    mockFetch({ response: [dayFlight, nightFlight], error: null });

    const flights = await provider.searchFlights({ ...baseParams, preferenceFlightTime: "night" });
    expect(flights).toHaveLength(1);
    expect(flights[0]?.outbound.departureTime).toContain("22:00");
  });

  it("includes inbound leg for round-trip", async () => {
    // First call: outbound HAN→NRT, second call: inbound NRT→HAN
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const sched =
        callCount === 1
          ? mockSchedule[0]!
          : { ...mockSchedule[0]!, dep_iata: "NRT", arr_iata: "HAN" };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ response: [sched], error: null }),
      });
    });

    const flights = await provider.searchFlights({ ...baseParams, roundTrip: true });

    expect(callCount).toBe(2);
    expect(flights[0]?.inbound).toBeDefined();
    expect(flights[0]?.inbound?.from).toBe("NRT");
    expect(flights[0]?.inbound?.to).toBe("HAN");
  });

  it("prefers same-airline pairing for round-trip inbound", async () => {
    const vnOutbound = {
      ...mockSchedule[0]!,
      dep_iata: "HAN",
      arr_iata: "NRT",
      cs_airline_iata: null,
    };
    const jlReturn = {
      ...mockSchedule[1]!,
      airline_iata: "JL",
      dep_iata: "NRT",
      arr_iata: "HAN",
      cs_airline_iata: null,
    };
    const vnReturn = {
      ...mockSchedule[0]!,
      airline_iata: "VN",
      dep_iata: "NRT",
      arr_iata: "HAN",
      cs_airline_iata: null,
    };

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const response = callCount === 1 ? [vnOutbound] : [jlReturn, vnReturn];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ response, error: null }),
      });
    });

    const flights = await provider.searchFlights({ ...baseParams, roundTrip: true });
    // VN outbound → should pair with VN return (same airline preference)
    expect(flights[0]?.inbound?.airline).toBe("VN");
  });

  it("returns empty array when API returns no results", async () => {
    mockFetch({ response: [], error: null });

    const flights = await provider.searchFlights(baseParams);
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
        json: jest.fn().mockResolvedValue({ response: [mockSchedule[0]!], error: null }),
      } as unknown as Response);
    });

    const flights = await provider.searchFlights(baseParams);
    expect(flights).toHaveLength(1);
    expect(callCount).toBe(2);
  }, 10000);

  it("throws on API error message in response body", async () => {
    mockFetch({ response: [], error: { message: "Invalid API key" } });

    await expect(provider.searchFlights(baseParams)).rejects.toThrow(
      "AirLabs API error: Invalid API key",
    );
  }, 10000);
});
