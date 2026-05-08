import Link from "next/link";
import type { Trip } from "@/types";

interface TripCardProps {
  trip: Trip;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  archived: "bg-amber-100 text-amber-700",
};

export function TripCard({ trip }: TripCardProps) {
  const startDate = new Date(trip.startDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endDate = new Date(trip.endDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const destination = trip.destinationCity ?? trip.destinationCountry ?? "Flexible";

  return (
    <Link href={`/trip/${trip.id}`} data-testid="trip-card">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{trip.title}</h2>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[trip.status] ?? ""}`}
          >
            {trip.status}
          </span>
        </div>
        <p className="text-indigo-600 font-medium mb-2">
          {trip.originAirport} → {destination}
        </p>
        <p className="text-gray-500 text-sm">
          {startDate} – {endDate}
        </p>
        {trip.flexibilityDays > 0 && (
          <p className="text-gray-400 text-xs mt-1">±{trip.flexibilityDays} days flexibility</p>
        )}
      </div>
    </Link>
  );
}
