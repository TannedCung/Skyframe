export type TripStatus = "draft" | "active" | "archived";
export type TripType = "round_trip" | "one_way";
export type FlightTimePreference = "day" | "night" | "any";
export type WatcherRole = "owner" | "viewer";
export type NotificationType = "invite";
export type GdsProvider = "auto" | "kiwi" | "vietjet" | "airlabs" | "google";

export interface User {
  id: string;
  email: string;
  name: string | null;
  googleId: string | null;
  notificationEmail: boolean;
  defaultCurrency: string;
  timezone: string;
  gdsProvider: GdsProvider;
  createdAt: Date;
}

export interface UserPreferences {
  notificationEmail: boolean;
  defaultCurrency: string;
  timezone: string;
  gdsProvider: GdsProvider;
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  originAirport: string;
  destinationCity: string | null;
  destinationCountry: string | null;
  startDate: Date;
  endDate: Date;
  flexibilityDays: number;
  preferenceCheapest: boolean;
  preferenceFlightTime: FlightTimePreference;
  tripType: TripType;
  status: TripStatus;
  lastFlightRefreshAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlightLeg {
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
}

export interface TripWatcher {
  id: string;
  tripId: string;
  email: string;
  role: WatcherRole;
  inviteToken: string;
  inviteAcceptedAt: Date | null;
  createdAt: Date;
}

export interface Notification {
  id: string;
  tripId: string;
  watcherEmail: string;
  type: NotificationType;
  payloadJson: Record<string, unknown>;
  sentAt: Date | null;
}
