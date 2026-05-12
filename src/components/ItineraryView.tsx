import type { DayItinerary, FlightSnapshot, Itinerary } from "@/types";

interface ItineraryViewProps {
  itinerary: Itinerary;
}

export function ItineraryView({ itinerary }: ItineraryViewProps) {
  const flight = itinerary.snapshotFlightDataJson;

  return (
    <div data-testid="itinerary-view" className="space-y-6">
      <FlightDetails flight={flight} />

      <div className="flex items-center gap-2 text-sm text-ink-500">
        <span className="bg-cream-200 text-ink-800 px-2 py-0.5 rounded-full font-mono text-xs">
          v{itinerary.version}
        </span>
        <span>Generated {new Date(itinerary.createdAt).toLocaleDateString()}</span>
      </div>

      <div>
        {itinerary.itineraryJson.map((day, i) => (
          <ItineraryDay key={day.day} day={day} isLast={i === itinerary.itineraryJson.length - 1} />
        ))}
      </div>
    </div>
  );
}

function FlightDetails({ flight }: { flight: FlightSnapshot }) {
  return (
    <div className="bg-teal-100 border border-teal-200 rounded-xl p-4">
      <h3 className="display-h2 font-semibold text-teal-800 mb-3 text-lg">Flight Details</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FlightLegCard label="Outbound" leg={flight.outbound} />
        {flight.inbound && <FlightLegCard label="Return" leg={flight.inbound} />}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {flight.priceAvailable ? (
          <span className="text-teal-800 font-semibold text-lg">
            {flight.currency} {flight.totalPrice.toFixed(2)}
          </span>
        ) : (
          <a
            href={flight.bookingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-yellow-700 italic hover:text-ink-900 hover:underline"
          >
            Price unavailable — search Google Flights →
          </a>
        )}
        {flight.priceAvailable && (
          <a
            href={flight.bookingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-teal-600 underline hover:text-teal-800"
          >
            Book on{" "}
            {flight.provider === "kiwi"
              ? "Kiwi"
              : flight.provider === "vietjet"
                ? "VietJetAir"
                : "airline site"}{" "}
            →
          </a>
        )}
      </div>
    </div>
  );
}

function FlightLegCard({
  label,
  leg,
}: {
  label: string;
  leg: {
    from: string;
    to: string;
    departureTime: string;
    arrivalTime: string;
    airline: string;
    flightNumber: string;
  };
}) {
  return (
    <div className="bg-white rounded-lg border border-teal-200 p-3">
      <p className="text-xs font-semibold text-teal-600 mb-1 uppercase tracking-wider">{label}</p>
      <p className="font-semibold text-ink-900">
        {leg.from} → {leg.to}
      </p>
      <p className="text-xs text-ink-500">
        {new Date(leg.departureTime).toLocaleString()} →{" "}
        {new Date(leg.arrivalTime).toLocaleString()}
      </p>
      <p className="text-xs text-ink-400 mt-0.5 font-mono">
        {leg.airline} {leg.flightNumber}
      </p>
    </div>
  );
}

function ItineraryDay({ day, isLast }: { day: DayItinerary; isLast: boolean }) {
  return (
    <div className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center shrink-0">
        <span className="bg-coral-500 text-ink-900 text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0">
          {day.day}
        </span>
        {!isLast && (
          <div
            className="flex-1 w-px mt-2"
            style={{
              background:
                "repeating-linear-gradient(to bottom, #EFE4C8 0px, #EFE4C8 6px, transparent 6px, transparent 12px)",
            }}
          />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 bg-white rounded-xl border border-line p-4 mb-4">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-line-soft">
          <div>
            <p className="font-semibold text-ink-900">{day.location}</p>
            <p className="text-xs font-mono uppercase tracking-wider mt-0.5 text-ink-500">
              {day.date}
            </p>
          </div>
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "#F8EDC9", color: "#6B5A4D" }}
          >
            Day {day.day}
          </span>
        </div>
        <ul className="space-y-2">
          {day.activities.map((activity, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-ink-800">
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full mt-2"
                style={{ background: "#F48F68" }}
              />
              <span className="flex-1">{activity}</span>
            </li>
          ))}
        </ul>
        {day.notes && (
          <div
            className="mt-3 flex gap-2 items-start text-xs rounded-lg p-3"
            style={{ background: "#FFF4D0", color: "#8A6B1F" }}
          >
            <span aria-hidden="true">✦</span>
            <span>{day.notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}
