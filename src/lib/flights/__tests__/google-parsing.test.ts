import { parseGoogleFlightsResponse } from "../google-parsing";

/**
 * Build a test fixture matching the real Google Flights API response structure.
 * Contains 1 connecting flight: HAN→SZX→NRT (Shenzhen Airlines), price 5,576,000 VND.
 */
function buildFixture(): string {
  const seg1 = [
    null,
    null,
    null,
    "HAN",
    "Noi Bai International Airport",
    "Shenzhen Bao'an International Airport",
    "SZX",
    null,
    [2, 10],
    null,
    [5],
    110,
    [],
    1,
    "30 in",
    null,
    1,
    "Airbus A320",
    [true],
    false,
    [2026, 6, 15],
    [2026, 6, 15],
    ["ZH", "108", null, "Shenzhen"],
    null,
    null,
    1,
    null,
    null,
    null,
    null,
    "30 inches",
    98052,
    1,
  ];
  const seg2 = [
    null,
    null,
    null,
    "SZX",
    "Shenzhen Bao'an International Airport",
    "Narita International Airport",
    "NRT",
    null,
    [12, 30],
    null,
    [18],
    270,
    [],
    1,
    "30 in",
    null,
    1,
    "Boeing 737",
    [null, true],
    false,
    [2026, 6, 15],
    [2026, 6, 15],
    ["ZH", "651", null, "Shenzhen"],
    null,
    null,
    1,
    null,
    null,
    null,
    null,
    "30 inches",
    277291,
    1,
  ];

  const flight = [
    [
      "ZH",
      ["Shenzhen"],
      [seg1, seg2],
      "HAN",
      [2026, 6, 15],
      [2, 10],
      "NRT",
      [2026, 6, 15],
      [18],
      830,
      null,
      false,
      null,
      null,
      null,
      "qrZUef",
      null,
      1,
      null,
      null,
      null,
      [1],
      null,
    ],
    [null, [null, 5576000], "bookingToken123"],
  ];

  const innerData = [null, null, [[flight]], null];
  const innerJson = JSON.stringify(innerData);
  const outer = JSON.stringify([["wrb.fr", null, innerJson], null, null]);
  return ")]}'\n" + outer;
}

describe("parseGoogleFlightsResponse", () => {
  it("parses connecting flight with segments and price", () => {
    const results = parseGoogleFlightsResponse(buildFixture());

    expect(results.length).toBeGreaterThanOrEqual(1);
    const flight = results[0]!;

    expect(flight.price).toBe(5576000);
    expect(flight.currency).toBe("VND");
    expect(flight.departureAirport).toBe("HAN");
    expect(flight.arrivalAirport).toBe("NRT");
    expect(flight.segments.length).toBe(2);
    expect(flight.segments[0].from).toBe("HAN");
    expect(flight.segments[0].to).toBe("SZX");
    expect(flight.segments[1].from).toBe("SZX");
    expect(flight.segments[1].to).toBe("NRT");
    expect(flight.segments[0].flightNumber).toBe("108");
    expect(flight.segments[1].flightNumber).toBe("651");
    expect(flight.segments[0].airline).toBe("ZH");
    expect(flight.departureTime).toContain("2026-06-15");
    expect(flight.departureTime).toContain("02:10");
    expect(flight.stops).toBe(1);
    expect(flight.isDayFlight).toBe(false);
  });

  it("throws for malformed response", () => {
    expect(() => parseGoogleFlightsResponse("")).toThrow();
    expect(() => parseGoogleFlightsResponse("invalid json")).toThrow();
  });
});
