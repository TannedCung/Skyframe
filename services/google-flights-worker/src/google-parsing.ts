/**
 * Parse Google Flights API response into structured flight data.
 *
 * Response format (verified 2026-05-14):
 *   1. Strip ")]}'" prefix
 *   2. JSON.parse → data[0][2] is a string → JSON.parse again
 *   3. Flight section at data[3][0]: flat array of itineraries
 *      Each itinerary is accessed via data[3][0][i][0] where i is flight index.
 *
 * Itinerary structure (data[3][0][i][0], 25 elements):
 *   [0]    = airline code (e.g. "VJ")
 *   [1]    = [airline name] (e.g. ["Vietjet"])
 *   [2]    = [segment] — single-element array containing the segment array
 *   [3]    = origin airport code
 *   [4]    = departure date [year, month, day]
 *   [5]    = departure time [hour, minute]
 *   [6]    = destination airport code
 *   [7]    = arrival date [year, month, day]
 *   [8]    = arrival time [hour, minute]
 *   [9]    = total duration in minutes
 *   [12]   = isDayFlight boolean
 *   [22]   = price info array (prices at [7], [8])
 *
 * Segment structure (itinerary[2][0], 33 elements):
 *   [3]    = origin airport code
 *   [5]    = destination airport name
 *   [6]    = destination airport code
 *   [8]    = departure time [hour, minute]
 *   [10]   = arrival time [hour, minute]
 *   [11]   = duration in minutes
 *   [17]   = aircraft type
 *   [20]   = departure date [year, month, day]
 *   [21]   = arrival date [year, month, day]
 *   [22]   = [airline code, airline name, url, ...]
 *   [31]   = price in minor units (VND)
 */

export interface ParsedGoogleFlight {
  airline: string;
  flightNumber: string;
  airlineName: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  price: number;
  currency: string;
  bookingToken: string;
  stops: number;
  isDayFlight: boolean;
  segments: GoogleFlightSegment[];
}

export interface GoogleFlightSegment {
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  aircraft: string;
  durationMinutes: number;
}

/** Strip the anti-XSSI prefix and double-parse. */
function parseResponseText(text: string): unknown[][] {
  const cleaned = text.startsWith(")]}'") ? text.slice(4) : text;
  const outer = JSON.parse(cleaned);
  const innerStr = outer?.[0]?.[2];
  if (!innerStr || typeof innerStr !== "string") {
    throw new Error("Invalid Google Flights response structure");
  }
  const data = JSON.parse(innerStr);
  if (!Array.isArray(data)) throw new Error("Expected array at response root");
  return data;
}

/** Check if value looks like an airport code. */
function isAirportCode(v: unknown): boolean {
  return typeof v === "string" && /^[A-Z]{3}$/.test(v);
}

/** Check if value looks like a date array [year, month, day]. */
function isDateArray(v: unknown): boolean {
  if (!Array.isArray(v) || v.length !== 3) return false;
  return (
    typeof v[0] === "number" && v[0] > 2000 &&
    typeof v[1] === "number" && v[1] >= 1 && v[1] <= 12 &&
    typeof v[2] === "number" && v[2] >= 1 && v[2] <= 31
  );
}

/**
 * Heuristic: does this array look like a flight itinerary?
 * Checks for airport codes at indices 3 and 6, dates at 4 and 7.
 */
function looksLikeItinerary(arr: unknown[]): boolean {
  if (!Array.isArray(arr) || arr.length < 10) return false;
  return isAirportCode(arr[3]) && isAirportCode(arr[6]) && isDateArray(arr[4]) && isDateArray(arr[7]);
}

/**
 * Extract all flight itineraries from parsed data.
 *
 * Primary path: data[3][0] = flat array of flights
 *   Each entry may be [itinerary, ...] → itinerary at entry[0]
 *   Or entry = itinerary directly
 */
function extractItineraries(data: unknown[]): unknown[][] {
  const results: unknown[][] = [];

  for (const section of data) {
    if (!Array.isArray(section)) continue;
    const flights = section[0];
    if (!Array.isArray(flights)) continue;

    for (const entry of flights) {
      if (!Array.isArray(entry)) continue;
      // entry[0] = itinerary (most common)
      if (looksLikeItinerary(entry[0] as unknown[])) {
        results.push(entry[0] as unknown[]);
      }
      // entry = itinerary directly
      else if (looksLikeItinerary(entry)) {
        results.push(entry);
      }
    }
  }
  return results;
}

/** Parse a segment array into structured data. */
function parseSegment(seg: unknown[]): GoogleFlightSegment | null {
  if (!Array.isArray(seg) || seg.length < 25) return null;

  const from = typeof seg[3] === "string" ? seg[3] : "";
  const to = typeof seg[6] === "string" ? seg[6] : "";
  if (!from || !to) return null;

  const depTime = Array.isArray(seg[8]) ? seg[8] : [0, 0];
  const arrTime = Array.isArray(seg[10]) ? seg[10] : [0, 0];
  const depDate = Array.isArray(seg[20]) ? seg[20] : null;
  const arrDate = Array.isArray(seg[21]) ? seg[21] : null;
  const duration = typeof seg[11] === "number" ? seg[11] : 0;
  const aircraft = typeof seg[17] === "string" ? seg[17] : "";
  const airlineInfo = Array.isArray(seg[22]) ? seg[22] : null;

  const depDateStr = depDate
    ? `${depDate[0]}-${String(depDate[1]).padStart(2, "0")}-${String(depDate[2]).padStart(2, "0")}`
    : "";
  const depTimeStr = `${String(depTime[0]).padStart(2, "0")}:${String(depTime[1]).padStart(2, "0")}`;
  const arrTimeStr = `${String(arrTime[0]).padStart(2, "0")}:${String(arrTime[1]).padStart(2, "0")}`;
  const arrDateStr = arrDate
    ? `${arrDate[0]}-${String(arrDate[1]).padStart(2, "0")}-${String(arrDate[2]).padStart(2, "0")}`
    : depDateStr;

  const airline = Array.isArray(airlineInfo) && typeof airlineInfo[0] === "string" ? airlineInfo[0] : "";
  const flightNumber = Array.isArray(airlineInfo) && typeof airlineInfo[1] === "string" ? airlineInfo[1] : "";

  return {
    from,
    to,
    departureTime: depDateStr ? `${depDateStr}T${depTimeStr}` : depTimeStr,
    arrivalTime: `${arrDateStr}T${arrTimeStr}`,
    airline,
    flightNumber,
    aircraft,
    durationMinutes: duration,
  };
}

/** Extract price from itinerary's price info block at [22]. */
function extractPrice(itinerary: unknown[]): number | null {
  // Primary: price at itinerary[22][7] or [22][8]
  if (Array.isArray(itinerary[22])) {
    const priceInfo = itinerary[22] as unknown[];
    for (const idx of [7, 8]) {
      if (typeof priceInfo[idx] === "number" && (priceInfo[idx] as number) > 0) {
        return priceInfo[idx] as number;
      }
    }
  }
  // Fallback: price in segment at [31]
  if (Array.isArray(itinerary[2]) && itinerary[2].length > 0) {
    const seg = itinerary[2][0];
    if (Array.isArray(seg) && typeof seg[31] === "number" && seg[31] > 0) {
      return seg[31] as number;
    }
  }
  return null;
}

/** Extract booking token from itinerary[17]. */
function extractToken(itinerary: unknown[]): string {
  return typeof itinerary[17] === "string" ? (itinerary[17] as string) : "";
}

/** Parse a single itinerary into a flight option. */
function parseItinerary(itinerary: unknown[]): ParsedGoogleFlight | null {
  const price = extractPrice(itinerary);
  if (price === null) return null;

  const bookingToken = extractToken(itinerary);

  // Parse segments
  const segsRaw = Array.isArray(itinerary[2]) ? itinerary[2] : [];
  const segments: GoogleFlightSegment[] = [];
  for (const segEntry of segsRaw as unknown[]) {
    if (Array.isArray(segEntry)) {
      const parsed = parseSegment(segEntry);
      if (parsed) segments.push(parsed);
    }
  }
  if (segments.length === 0) return null;

  const firstSeg = segments[0]!;
  const lastSeg = segments[segments.length - 1]!;

  const airlineCode = typeof itinerary[0] === "string" ? itinerary[0] : "";
  const airlineNameArr = Array.isArray(itinerary[1]) ? itinerary[1] : null;
  const airlineName = airlineNameArr && typeof airlineNameArr[0] === "string" ? (airlineNameArr[0] as string) : "";
  const airline = firstSeg.airline || airlineCode;
  const durationMinutes = typeof itinerary[9] === "number" ? itinerary[9] as number : segments.reduce((s, seg) => s + seg.durationMinutes, 0);
  const isDayFlight = typeof itinerary[12] === "boolean" ? itinerary[12] as boolean : (firstSeg.departureTime.slice(11, 13) >= "06" && firstSeg.departureTime.slice(11, 13) < "20");

  // Build departure/arrival from itinerary-level fields
  let departureTime = firstSeg.departureTime;
  if (isDateArray(itinerary[4]) && Array.isArray(itinerary[5])) {
    const d = `${itinerary[4][0]}-${String(itinerary[4][1]).padStart(2, "0")}-${String(itinerary[4][2]).padStart(2, "0")}`;
    const t = `${String(itinerary[5][0]).padStart(2, "0")}:${String(itinerary[5][1]).padStart(2, "0")}`;
    departureTime = `${d}T${t}`;
  }

  let arrivalTime = lastSeg.arrivalTime;
  if (isDateArray(itinerary[7]) && Array.isArray(itinerary[8])) {
    const a = `${itinerary[7][0]}-${String(itinerary[7][1]).padStart(2, "0")}-${String(itinerary[7][2]).padStart(2, "0")}`;
    const t = `${String(itinerary[8][0]).padStart(2, "0")}:${String(itinerary[8][1]).padStart(2, "0")}`;
    arrivalTime = `${a}T${t}`;
  }

  return {
    airline,
    flightNumber: firstSeg.flightNumber || `${airline}`,
    airlineName,
    departureAirport: firstSeg.from,
    arrivalAirport: lastSeg.to,
    departureTime,
    arrivalTime,
    durationMinutes,
    price,
    currency: "VND",
    bookingToken,
    stops: segments.length - 1,
    isDayFlight,
    segments,
  };
}

/** Full response parsing: raw text → array of parsed flights. */
export function parseGoogleFlightsResponse(text: string): ParsedGoogleFlight[] {
  const data = parseResponseText(text);
  const itineraries = extractItineraries(data);
  const results: ParsedGoogleFlight[] = [];

  for (const it of itineraries) {
    const parsed = parseItinerary(it);
    if (parsed) results.push(parsed);
  }

  // Deduplicate by airline + departure time
  const seen = new Set<string>();
  return results.filter((f) => {
    const key = `${f.airline}-${f.departureTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
