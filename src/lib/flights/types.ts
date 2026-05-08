import type { FlightTimePreference } from "@/types";

export interface FlightSearchParams {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  returnFrom?: string;
  returnTo?: string;
  roundTrip: boolean;
  maxStops?: number;
  preferenceCheapest: boolean;
  preferenceFlightTime: FlightTimePreference;
}

export interface FlightOption {
  provider: "airlabs" | "kiwi" | "amadeus" | "other";
  price: number;
  currency: string;
  /** false when the provider does not supply pricing (e.g. AirLabs) */
  priceAvailable: boolean;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  bookingLink: string;
  isDayFlight: boolean;
}

export interface FlightLeg {
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
}

export interface FlightProvider {
  searchFlights(params: FlightSearchParams): Promise<FlightOption[]>;
}
