export type TripStatus = "draft" | "active" | "archived";
export type TripType = "round_trip" | "one_way";
export type FlightTimePreference = "day" | "night" | "any";
export type ItineraryStatus = "current" | "superseded";
export type WatcherRole = "owner" | "viewer";
export type NotificationType = "price_change" | "new_itinerary_version" | "invite";
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

export interface TripRawOption {
  id: string;
  tripId: string;
  llmRawPlanJson: SG1Option;
  selected: boolean;
  createdAt: Date;
}

export interface SG1Option {
  id: string;
  entryCity: string;
  exitCity: string;
  approximateDates: { start: string; end: string };
  theme: string;
  airports: { entry: string; exit: string };
  description?: string;
}

export interface Itinerary {
  id: string;
  tripId: string;
  version: number;
  parentVersionId: string | null;
  status: ItineraryStatus;
  itineraryJson: DayItinerary[];
  snapshotFlightDataJson: FlightSnapshot;
  cheapestTotalPrice: number;
  currency: string;
  createdAt: Date;
}

export interface DayItinerary {
  day: number;
  date: string;
  location: string;
  activities: string[];
  notes?: string;
}

export interface FlightSnapshot {
  outbound: FlightLeg;
  inbound?: FlightLeg;
  totalPrice: number;
  currency: string;
  bookingLink: string;
  provider: string;
  priceAvailable: boolean;
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
