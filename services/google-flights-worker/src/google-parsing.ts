/**
 * Parse Google Flights API response into structured flight data.
 *
 * Response format (reverse-engineered from live API):
 *   1. Strip ")]}'" prefix
 *   2. JSON.parse → data[0][2] is a string → JSON.parse again
 *   3. Flight arrays live at data[2] and data[3]
 *
 * Per-flight itinerary array indices:
 *   [0]    = airline code (e.g. "ZH")
 *   [1]    = airline name (e.g. ["Shenzhen"])
 *   [2]    = segments array (each segment has full detail)
 *   [3]    = origin airport code
 *   [4]    = departure date [year, month, day]
 *   [5]    = departure time [hour, minute]
 *   [6]    = destination airport code
 *   [7]    = arrival date [year, month, day]
 *   [9]    = total duration in minutes
 *
 * Per-segment array (inside itinerary[2]):
 *   [3]    = departure airport code
 *   [6]    = arrival airport code
 *   [8]    = departure time [hour, minute]
 *   [11]   = segment duration in minutes
 *   [17]   = aircraft type (e.g. "Airbus A320")
 *   [20]   = departure date [year, month, day]
 *   [21]   = arrival date [year, month, day]
 *   [22]   = [airline code, flight number, null, airline name]
 *
 * Price block (itinerary[1] from outer flight array):
 *   [0]    = null
 *   [1]    = [null, price_in_minor_units]
 *   [2]    = booking token (base64)
 */

export interface ParsedGoogleFlight {
  airline: string;
  flightNumber: string;
  airlineName: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string; // ISO local datetime
  arrivalTime: string; // ISO local datetime
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

/**
 * Strip the anti-XSSI prefix and double-parse the response.
 */
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

/**
 * Extract all flight arrays from the parsed response.
 */
function extractFlightArrays(data: unknown[]): unknown[][] {
  const flights: unknown[][] = [];
  for (const idx of [2, 3]) {
    const bucket = data[idx];
    if (Array.isArray(bucket) && Array.isArray(bucket[0])) {
      for (const item of bucket[0]) {
        if (Array.isArray(item)) {
          flights.push(item);
        }
      }
    }
  }
  return flights;
}

/**
 * Parse a single segment array into structured data.
 */
function parseSegment(seg: unknown[]): GoogleFlightSegment | null {
  if (!Array.isArray(seg) || seg.length < 25) return null;

  const from = typeof seg[3] === "string" ? seg[3] : "";
  const to = typeof seg[6] === "string" ? seg[6] : "";
  const depTime = Array.isArray(seg[8]) ? seg[8] : null;
  const depDate = Array.isArray(seg[20]) ? seg[20] : null;
  const airlineInfo = Array.isArray(seg[22]) ? seg[22] : null;
  const duration = typeof seg[11] === "number" ? seg[11] : 0;
  const aircraft = typeof seg[17] === "string" ? seg[17] : "";

  if (!from || !to) return null;

  const depTimeParts = Array.isArray(depTime) ? depTime : [0, 0];
  const depDateParts = Array.isArray(depDate) ? depDate : [0, 1, 1];

  // Approximate arrival time: departure + duration
  const depDateStr = `${depDateParts[0]}-${String(depDateParts[1]).padStart(2, "0")}-${String(depDateParts[2]).padStart(2, "0")}`;
  const depTimeStr = `${String(depTimeParts[0]).padStart(2, "0")}:${String(depTimeParts[1]).padStart(2, "0")}`;

  // Calculate arrival time
  const depHour = depTimeParts[0] ?? 0;
  const depMin = depTimeParts[1] ?? 0;
  const totalMin = depHour * 60 + depMin + duration;
  const arrHour = Math.floor(totalMin / 60) % 24;
  const arrMin = totalMin % 60;
  const arrTimeStr = `${String(arrHour).padStart(2, "0")}:${String(arrMin).padStart(2, "0")}`;

  const airline =
    Array.isArray(airlineInfo) && typeof airlineInfo[0] === "string" ? airlineInfo[0] : "";
  const flightNumber =
    Array.isArray(airlineInfo) && typeof airlineInfo[1] === "string" ? airlineInfo[1] : "";

  return {
    from,
    to,
    departureTime: `${depDateStr}T${depTimeStr}`,
    arrivalTime: `${depDateStr}T${arrTimeStr}`,
    airline,
    flightNumber,
    aircraft,
    durationMinutes: duration,
  };
}

/**
 * Parse a single flight item from the response.
 */
function parseFlight(item: unknown[]): ParsedGoogleFlight | null {
  // item[0] = itinerary array, item[1] = price block
  const itinerary = Array.isArray(item[0]) ? item[0] : null;
  const priceBlock = Array.isArray(item[1]) ? item[1] : null;

  if (!itinerary || !priceBlock) return null;

  // Parse price
  const priceArr = Array.isArray(priceBlock[1]) ? priceBlock[1] : null;
  const price = Array.isArray(priceArr) && typeof priceArr[1] === "number" ? priceArr[1] : null;
  const bookingToken = typeof priceBlock[2] === "string" ? priceBlock[2] : "";

  if (price === null || price <= 0) return null; // skip flights without price

  // Parse segments
  const segsRaw = Array.isArray(itinerary[2]) ? itinerary[2] : null;
  const segments: GoogleFlightSegment[] = [];

  if (segsRaw) {
    for (const seg of segsRaw) {
      if (Array.isArray(seg)) {
        const parsed = parseSegment(seg);
        if (parsed) segments.push(parsed);
      }
    }
  }

  if (segments.length === 0) return null;

  // Build outbound flight leg from first segment
  const firstSeg = segments[0]!;
  const lastSeg = segments[segments.length - 1]!;

  const airline = firstSeg.airline || (typeof itinerary[0] === "string" ? itinerary[0] : "");
  const airlineName =
    Array.isArray(itinerary[1]) && typeof itinerary[1][0] === "string" ? itinerary[1][0] : "";

  const durationMinutes = typeof itinerary[9] === "number" ? itinerary[9] : lastSeg.durationMinutes;

  // Departure time from itinerary-level fields
  const depDate = Array.isArray(itinerary[4]) ? itinerary[4] : null;
  const depTimeArr = Array.isArray(itinerary[5]) ? itinerary[5] : null;

  let departureTime = firstSeg.departureTime;
  let arrivalTime = lastSeg.arrivalTime;

  if (depDate && depTimeArr) {
    const d = `${depDate[0]}-${String(depDate[1]).padStart(2, "0")}-${String(depDate[2]).padStart(2, "0")}`;
    const t = `${String(depTimeArr[0]).padStart(2, "0")}:${String(depTimeArr[1]).padStart(2, "0")}`;
    departureTime = `${d}T${t}`;
  }

  const arrDate = Array.isArray(itinerary[7]) ? itinerary[7] : null;
  if (arrDate) {
    // Calculate arrival from departure + total duration
    const depParts = departureTime.split("T");
    const depH = parseInt(depParts[1]?.slice(0, 2) ?? "0", 10);
    const depM = parseInt(depParts[1]?.slice(3, 5) ?? "0", 10);
    const totalMin = depH * 60 + depM + durationMinutes;
    const arrH = Math.floor(totalMin / 60) % 24;
    const arrM = totalMin % 60;
    const a = `${arrDate[0]}-${String(arrDate[1]).padStart(2, "0")}-${String(arrDate[2]).padStart(2, "0")}`;
    arrivalTime = `${a}T${String(arrH).padStart(2, "0")}:${String(arrM).padStart(2, "0")}`;
  }

  const depHour = parseInt(departureTime.slice(11, 13), 10);
  const isDayFlight = depHour >= 6 && depHour < 20;

  return {
    airline,
    flightNumber:
      firstSeg.flightNumber || `${airline}${firstSeg.flightNumber ? "" : durationMinutes}`,
    airlineName,
    departureAirport: firstSeg.from,
    arrivalAirport: lastSeg.to,
    departureTime,
    arrivalTime,
    durationMinutes,
    price,
    currency: "VND", // Google returns VND for Vietnam IP; can be overridden via curr= parameter
    bookingToken,
    stops: segments.length - 1,
    isDayFlight,
    segments,
  };
}

/**
 * Full response parsing: raw text → array of parsed flights.
 */
export function parseGoogleFlightsResponse(text: string): ParsedGoogleFlight[] {
  const data = parseResponseText(text);
  const items = extractFlightArrays(data);
  const results: ParsedGoogleFlight[] = [];

  for (const item of items) {
    const parsed = parseFlight(item);
    if (parsed) {
      // Build a proper flight number if missing
      if (!parsed.flightNumber || parsed.flightNumber === parsed.airline) {
        parsed.flightNumber = `${parsed.airline}${parsed.segments.map((s) => s.flightNumber || "?").join("+")}`;
      }
      results.push(parsed);
    }
  }

  // Deduplicate by first-segment flight number + departure time
  const seen = new Set<string>();
  return results.filter((f) => {
    const key = `${f.segments[0]?.flightNumber ?? ""}-${f.departureTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
