/**
 * Build and encode the nested filter array that Google Flights expects.
 * Ported from trvl (Go) `batchexec/buildFilters` + fli (Python) `FlightSearchFilters.format()`.
 */

interface FilterSegment {
  origin: string;
  destination: string;
  date: string;
  maxStops?: number;
  departAfter?: number;
  departBefore?: number;
  maxDuration?: number;
  airlines?: string[];
}

export interface GoogleFilterInput {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  roundTrip: boolean;
  maxStops?: number;
  preferenceCheapest: boolean;
  departAfter?: number;
  departBefore?: number;
  maxDuration?: number;
  airlines?: string[];
}

function buildSegment(seg: FilterSegment): unknown[] {
  const timeWindow =
    seg.departAfter !== undefined || seg.departBefore !== undefined
      ? [seg.departAfter ?? 0, seg.departBefore ?? 24]
      : null;
  const airlines = seg.airlines?.length ? seg.airlines : null;
  const stops = seg.maxStops ?? 0; // 0=any, 1=nonstop, 2=1stop, 3=2+
  const duration = seg.maxDuration && seg.maxDuration > 0 ? seg.maxDuration : null;

  return [
    [[[seg.origin, 0]]], // [0] departure airports
    [[[seg.destination, 0]]], // [1] arrival airports
    timeWindow, // [2] departure time window
    stops, // [3] max stops
    airlines, // [4] airlines
    null, // [5] alliances
    seg.date, // [6] travel date
    duration, // [7] max duration
    null, // [8] selected flight
    null, // [9] layover airports
    null, // [10]
    null, // [11]
    null, // [12] layover duration
    null, // [13] emissions
    3, // [14]
  ];
}

export function buildGoogleFilters(input: GoogleFilterInput): unknown[] {
  const outbound = buildSegment({
    origin: input.origin,
    destination: input.destination,
    date: input.dateFrom,
    maxStops: input.maxStops,
    departAfter: input.departAfter,
    departBefore: input.departBefore,
    maxDuration: input.maxDuration,
    airlines: input.airlines,
  });

  const segments: unknown[] = [outbound];

  if (input.roundTrip && input.dateTo && input.dateTo !== input.dateFrom) {
    segments.push(
      buildSegment({
        origin: input.destination,
        destination: input.origin,
        date: input.dateTo,
        maxStops: input.maxStops,
        departAfter: input.departAfter,
        departBefore: input.departBefore,
        maxDuration: input.maxDuration,
        airlines: input.airlines,
      }),
    );
  }

  const tripType = input.roundTrip ? 1 : 2;
  const sortBy = input.preferenceCheapest ? 2 : 1; // 1=best, 2=cheapest

  return [
    [], // outer[0]: empty = flights mode
    [
      null, // [0]
      null, // [1]
      tripType, // [2] trip type: 1=round-trip, 2=one-way
      null, // [3]
      [], // [4]
      1, // [5] cabin class: 1=economy
      [1, 0, 0, 0], // [6] passengers: [adults, children, infants_lap, infants_seat]
      null, // [7] price limit
      null, // [8]
      null, // [9]
      null, // [10] bags
      null, // [11]
      null, // [12]
      segments, // [13] flight segments
      null, // [14]
      null, // [15]
      null, // [16]
      1, // [17]
      null, // [18]
      null, // [19]
      null, // [20]
      null, // [21]
      null, // [22]
      null, // [23]
      null, // [24]
      null, // [25]
      null, // [26]
      null, // [27]
      0, // [28] exclude basic economy
    ],
    sortBy, // outer[2] sort mode
    1, // outer[3] show all results
    0, // outer[4]
    1, // outer[5]
  ];
}

export function encodeGoogleFilters(filters: unknown[]): string {
  const json = JSON.stringify(filters, (_, v) => (v === undefined ? null : v));
  const wrapped = [null, json];
  return encodeURIComponent(JSON.stringify(wrapped));
}
