import Link from "next/link";
import type { Trip } from "@/types";
import { StatusBadge } from "./StatusBadge";

const TRIP_BANDS = ["#8BDFDD", "#FFE394", "#E5F8F7", "#FFE5DA", "#FBB89A", "#BDECEA"];

function bandColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash * 31 + id.charCodeAt(i)) >>> 0) % TRIP_BANDS.length;
  }
  return TRIP_BANDS[hash] ?? "#8BDFDD";
}

export function TripCard({ trip }: { trip: Trip }) {
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
  const band = bandColor(trip.id);

  return (
    <Link href={`/trip/${trip.id}`} data-testid="trip-card">
      <div
        className="bg-white rounded-2xl border border-line overflow-hidden hover:shadow-md transition-all cursor-pointer w-full"
        style={{ boxShadow: "0 1px 2px 0 rgb(74 50 30 / 0.06)" }}
      >
        {/* Image strip */}
        <div
          className="relative flex items-center justify-center"
          style={{ aspectRatio: "16 / 7", background: band }}
        >
          <span className="text-ink-800 text-sm font-mono uppercase tracking-wider opacity-40">
            {destination}
          </span>
          <div className="absolute top-3 left-3">
            <StatusBadge status={trip.status} />
          </div>
          <div
            className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-wider"
            style={{ background: "rgba(255, 246, 222, 0.92)", color: "#2A1E15" }}
          >
            {trip.originAirport} → {destination}
          </div>
        </div>
        {/* Meta */}
        <div className="p-5">
          <h2 className="display-h2 text-lg font-semibold text-ink-900 truncate mb-1.5">
            {trip.title}
          </h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-700">
              {startDate} – {endDate}
            </span>
            {trip.flexibilityDays > 0 && (
              <span
                className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "#F8EDC9", color: "#6B5A4D" }}
              >
                ±{trip.flexibilityDays}d flex
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
