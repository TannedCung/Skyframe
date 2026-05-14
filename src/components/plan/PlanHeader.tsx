import { StatusBadge } from "../StatusBadge";
import type { Trip } from "@/types";

interface PlanHeaderProps {
  trip: Trip | null;
  hint?: { active: boolean; text: string };
}

export function PlanHeader({ trip, hint }: PlanHeaderProps) {
  if (!trip) {
    return (
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-cream-50">
        <h2 className="display-tight text-sm font-semibold text-ink-900 tracking-wide uppercase">
          Trip Plan (Draft)
        </h2>
        {hint && (
          <span
            className={`text-xs transition-opacity ${
              hint.active ? "opacity-100 text-teal-600" : "opacity-50 text-ink-500"
            }`}
          >
            {hint.text}
          </span>
        )}
      </div>
    );
  }

  const destination = trip.destinationCity ?? trip.destinationCountry ?? "—";
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  const durationDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="border-b border-line bg-cream-50 px-5 py-3">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h2 className="display-tight text-sm font-semibold text-ink-900 tracking-wide uppercase">
          Trip Plan
        </h2>
        <StatusBadge status={trip.status} />
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs text-ink-700">
        <span className="font-mono uppercase tracking-wider text-ink-900">
          {trip.originAirport} → {destination}
        </span>
        <span className="text-ink-400">·</span>
        <span>
          {fmt(start)} – {fmt(end)}
        </span>
        <span className="text-ink-400">·</span>
        <span className="text-ink-500">{durationDays}d</span>
        {hint && hint.active && (
          <>
            <span className="text-ink-400">·</span>
            <span className="text-teal-600">{hint.text}</span>
          </>
        )}
      </div>
    </div>
  );
}
