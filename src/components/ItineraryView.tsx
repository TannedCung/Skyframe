import type { Itinerary } from "@/types";

interface ItineraryViewProps {
  itinerary: Itinerary;
}

export function ItineraryView({ itinerary }: ItineraryViewProps) {
  const flight = itinerary.snapshotFlightDataJson;

  return (
    <div data-testid="itinerary-view" className="space-y-6">
      {/* Flight summary */}
      <div className="bg-teal-100 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-800 mb-3">Flight Details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FlightLegCard label="Outbound" leg={flight.outbound} />
          {flight.inbound && <FlightLegCard label="Return" leg={flight.inbound} />}
        </div>
        <div className="mt-3 flex items-center justify-between">
          {flight.priceAvailable ? (
            <span className="text-teal-600 font-semibold text-lg">
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

      {/* Version badge */}
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <span className="bg-cream-200 px-2 py-0.5 rounded-full font-mono">
          v{itinerary.version}
        </span>
        <span>Generated {new Date(itinerary.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Day-by-day */}
      <div className="space-y-4">
        {itinerary.itineraryJson.map((day) => (
          <div key={day.day} className="bg-white rounded-xl border border-line p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-coral-500 text-ink-900 text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center">
                {day.day}
              </span>
              <div>
                <p className="font-semibold text-ink-900">{day.location}</p>
                <p className="text-xs text-ink-500">{day.date}</p>
              </div>
            </div>
            <ul className="space-y-1">
              {day.activities.map((activity, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="text-coral-300 mt-0.5">•</span>
                  {activity}
                </li>
              ))}
            </ul>
            {day.notes && (
              <p className="mt-2 text-xs text-yellow-700 bg-yellow-100 rounded p-2">{day.notes}</p>
            )}
          </div>
        ))}
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
      <p className="text-xs font-semibold text-teal-600 mb-1">{label}</p>
      <p className="font-semibold text-ink-900">
        {leg.from} → {leg.to}
      </p>
      <p className="text-xs text-ink-500">
        {new Date(leg.departureTime).toLocaleString()} →{" "}
        {new Date(leg.arrivalTime).toLocaleString()}
      </p>
      <p className="text-xs text-ink-400 mt-0.5">
        {leg.airline} {leg.flightNumber}
      </p>
    </div>
  );
}
