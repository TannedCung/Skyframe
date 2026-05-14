import type { FlightProvider, FlightSearchParams, FlightOption, FlightLeg } from "./types";
import logger from "@/lib/logger";

const BOOKING_BASE_URL = "https://www.vietjetair.com/vi/select-flight";
const MAX_RETRIES = 2;

interface ServiceFlight {
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  from: string;
  to: string;
  priceVnd: number;
  bookingLink: string;
}

interface ServiceSearchResult {
  flights: ServiceFlight[];
  capturedAt: string;
}

export class VietJetAirFlightProvider implements FlightProvider {
  private readonly serviceUrl: string;
  private readonly serviceSecret: string;

  constructor(opts: { serviceUrl: string; serviceSecret: string }) {
    this.serviceUrl = opts.serviceUrl.replace(/\/$/, "");
    this.serviceSecret = opts.serviceSecret;
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    const outboundFlights = await this.fetchFromService(
      params.origin,
      params.destination,
      params.dateFrom,
    );

    let inboundFlights: ServiceFlight[] = [];
    if (params.roundTrip) {
      const returnDate = params.returnFrom ?? params.dateTo;
      inboundFlights = await this.fetchFromService(params.destination, params.origin, returnDate);
    }

    const options = this.buildOptions(outboundFlights, inboundFlights, params);

    if (params.preferenceFlightTime !== "any") {
      return options.filter((f) =>
        params.preferenceFlightTime === "day" ? f.isDayFlight : !f.isDayFlight,
      );
    }

    return options;
  }

  private async fetchFromService(
    origin: string,
    destination: string,
    date: string,
  ): Promise<ServiceFlight[]> {
    const url = `${this.serviceUrl}/search/vietjet?origin=${origin}&destination=${destination}&date=${date}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${this.serviceSecret}` },
          signal: AbortSignal.timeout(120_000), // browser search can take up to 60s
        });

        if (!res.ok) {
          throw new Error(`VietJet service returned ${res.status}`);
        }

        const data = (await res.json()) as ServiceSearchResult;
        return data.flights ?? [];
      } catch (err) {
        logger.warn({ attempt, origin, destination, date, err }, "VietJet service call failed");
        if (attempt === MAX_RETRIES) throw err;
      }
    }

    return [];
  }

  private buildOptions(
    outbound: ServiceFlight[],
    inbound: ServiceFlight[],
    params: FlightSearchParams,
  ): FlightOption[] {
    if (outbound.length === 0) return [];

    return outbound.map((out): FlightOption => {
      const departureHour = parseHour(out.departureTime);
      const isDayFlight = departureHour >= 6 && departureHour < 20;

      const outboundLeg: FlightLeg = {
        departureTime: out.departureTime,
        arrivalTime: out.arrivalTime,
        airline: out.airline,
        flightNumber: out.flightNumber,
        from: out.from,
        to: out.to,
      };

      let inboundLeg: FlightLeg | undefined;
      if (params.roundTrip && inbound.length > 0) {
        // Pair by same airline when possible, else take first
        const paired = inbound.find((i) => i.airline === out.airline) ?? inbound[0]!;
        inboundLeg = {
          departureTime: paired.departureTime,
          arrivalTime: paired.arrivalTime,
          airline: paired.airline,
          flightNumber: paired.flightNumber,
          from: paired.from,
          to: paired.to,
        };
      }

      const bookingLink =
        out.bookingLink ||
        `${BOOKING_BASE_URL}?departAirport=${params.origin}&arrivalAirport=${params.destination}&departDate=${params.dateFrom}&adultCount=1`;

      return {
        provider: "vietjet",
        price: out.priceVnd,
        currency: "VND",
        priceAvailable: out.priceVnd > 0,
        outbound: outboundLeg,
        inbound: inboundLeg,
        bookingLink,
        isDayFlight,
      };
    });
  }
}

function parseHour(isoLike: string): number {
  const timePart = isoLike.split("T")[1] ?? "00:00:00";
  return parseInt(timePart.split(":")[0] ?? "0", 10);
}
