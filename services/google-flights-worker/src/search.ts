import { post } from "impers";
import { buildGoogleFilters, encodeGoogleFilters } from "./google-encoding";
import { parseGoogleFlightsResponse, type ParsedGoogleFlight } from "./google-parsing";
import { logger } from "./logger";

const FLIGHTS_URL =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?hl=en";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface SearchParams {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  roundTrip: boolean;
  maxStops?: number;
  preferenceCheapest: boolean;
  preferenceFlightTime?: "any" | "day" | "night";
  airlines?: string[];
}

export interface FlightLeg {
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
}

export interface FlightOption {
  provider: "google";
  price: number;
  currency: string;
  priceAvailable: boolean;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  bookingLink: string;
  isDayFlight: boolean;
}

export interface SearchResult {
  flights: FlightOption[];
  capturedAt: string;
}

export async function searchGoogleFlights(params: SearchParams): Promise<SearchResult> {
  const filters = buildGoogleFilters({
    origin: params.origin,
    destination: params.destination,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    roundTrip: params.roundTrip,
    maxStops: params.maxStops,
    preferenceCheapest: params.preferenceCheapest,
    departAfter: params.preferenceFlightTime === "day" ? 6 : undefined,
    departBefore: params.preferenceFlightTime === "day" ? 20 : undefined,
    airlines: params.airlines,
  });

  const encoded = encodeGoogleFilters(filters);
  const body = `f.req=${encoded}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await post(FLIGHTS_URL, {
        impersonate: "chrome146",
        data: body,
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": CHROME_UA,
          referer: "https://www.google.com/travel/flights",
        },
        timeout: 20_000,
      });

      if (res.status === 403) throw new Error("Google Flights blocked (403)");
      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error("Google Flights rate limit exceeded");
      }
      if (res.status !== 200) throw new Error(`Google Flights error: HTTP ${res.status}`);

      const parsed = parseGoogleFlightsResponse(res.text);
      let results = parsed.map(mapToFlightOption);

      if (params.preferenceFlightTime && params.preferenceFlightTime !== "any") {
        results = results.filter((f) =>
          params.preferenceFlightTime === "day" ? f.isDayFlight : !f.isDayFlight,
        );
      }

      logger.info({ count: results.length, attempt }, "Google Flights search succeeded");
      return { flights: results, capturedAt: new Date().toISOString() };
    } catch (error) {
      logger.warn({ attempt, error: String(error) }, "Google Flights attempt failed");
      if (attempt === MAX_RETRIES) throw error;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { flights: [], capturedAt: new Date().toISOString() };
}

function mapToFlightOption(f: ParsedGoogleFlight): FlightOption {
  const outbound: FlightLeg = {
    departureTime: f.segments[0]?.departureTime ?? f.departureTime,
    arrivalTime: f.segments[0]?.arrivalTime ?? f.arrivalTime,
    airline: f.segments[0]?.airline ?? f.airline,
    flightNumber: f.segments[0]?.flightNumber ?? f.flightNumber,
    from: f.segments[0]?.from ?? f.departureAirport,
    to: f.segments[0]?.to ?? f.arrivalAirport,
  };

  const inbound: FlightLeg | undefined =
    f.segments.length > 1
      ? {
          departureTime: f.segments[1]?.departureTime ?? "",
          arrivalTime: f.segments[1]?.arrivalTime ?? "",
          airline: f.segments[1]?.airline ?? "",
          flightNumber: f.segments[1]?.flightNumber ?? "",
          from: f.segments[1]?.from ?? "",
          to: f.segments[1]?.to ?? "",
        }
      : undefined;

  return {
    provider: "google",
    price: f.price,
    currency: f.currency,
    priceAvailable: true,
    outbound,
    inbound,
    bookingLink: `https://www.google.com/travel/flights?q=flights+from+${f.departureAirport}+to+${f.arrivalAirport}`,
    isDayFlight: f.isDayFlight,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
