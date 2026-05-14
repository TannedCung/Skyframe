"use client";

import Link from "next/link";
import type { Trip } from "@/types";
import { StatusBadge } from "./StatusBadge";

const TRIP_BANDS = ["#8BDFDD", "#FFE394", "#E5F8F7", "#FFE5DA", "#FBB89A", "#BDECEA"];
const TRIP_IMAGES = [
  "https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513735492246-483525079686?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1539066319984-d54f25c69cdc?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1539020140153-e479b8c5b1cb?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=800&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1520466809213-7b9a56adcd45?w=800&q=75&auto=format&fit=crop",
];

function bandColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash * 31 + id.charCodeAt(i)) >>> 0) % TRIP_BANDS.length;
  }
  return TRIP_BANDS[hash] ?? "#8BDFDD";
}

function tripImage(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash * 31 + id.charCodeAt(i)) >>> 0) % TRIP_IMAGES.length;
  }
  return TRIP_IMAGES[hash] ?? TRIP_IMAGES[0]!;
}

export function TripCard({ trip }: { trip: Trip }) {
  const startDate = new Date(trip.startDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endDate = new Date(trip.endDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const destination = trip.destinationCity ?? trip.destinationCountry ?? "Flexible";
  const band = bandColor(trip.id);
  const imgSrc = tripImage(trip.id);

  return (
    <Link href={`/trip/${trip.id}`} data-testid="trip-card">
      <article
        className="rounded-[18px] border border-line overflow-hidden hover:shadow-lg transition-all cursor-pointer w-full bg-cream-50"
        style={{
          boxShadow: "0 1px 2px rgba(74,50,30,.06)",
        }}
      >
        {/* Image */}
        <div className="relative" style={{ aspectRatio: "16 / 9" }}>
          <img
            src={imgSrc}
            alt={destination}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ background: band }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute top-3.5 left-3.5">
            <StatusBadge status={trip.status} />
          </div>
          <div
            className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full mono-label"
            style={{ background: "rgba(255,246,222,.94)", color: "#2A1E15" }}
          >
            {trip.originAirport} → {destination}
          </div>
        </div>
        {/* Meta */}
        <div className="p-5">
          <h2
            className="font-semibold truncate mb-1.5 text-ink-900"
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: "18px",
              letterSpacing: "-0.01em",
            }}
          >
            {trip.title}
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">
              {startDate} – {endDate}
            </span>
            {trip.flexibilityDays > 0 && (
              <span className="mono-label px-2 py-0.5 rounded-full" style={{ color: "#6B5A4D" }}>
                ±{trip.flexibilityDays}d flex
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
