import { StatusBadge } from "../StatusBadge";
import type { Trip } from "@/types";

interface PlanHeaderProps {
  trip: Trip | null;
  hint?: { active: boolean; text: string };
  flightsLocked?: boolean;
}

export function PlanHeader({ trip, hint, flightsLocked = false }: PlanHeaderProps) {
  if (!trip) {
    return (
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{
          background: "var(--color-cream-50, #FFFAEC)",
          borderColor: "var(--color-line, #EFE4C8)",
        }}
      >
        <span className="mono-label" style={{ color: "var(--color-ink-700, #6B5A4D)" }}>
          Trip Plan · Draft
        </span>
        {hint && (
          <span
            className="text-xs transition-opacity"
            style={{
              color: hint.active
                ? "var(--color-teal-600, #2FA5A1)"
                : "var(--color-ink-500, #968471)",
            }}
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
    <div
      className="border-b px-5"
      style={{
        background: "var(--color-cream-50, #FFFAEC)",
        borderColor: "var(--color-line, #EFE4C8)",
        paddingTop: "16px",
        paddingBottom: "12px",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="mono-label" style={{ color: "var(--color-ink-500, #968471)" }}>
          Trip plan ·{" "}
          {trip.status === "active"
            ? "Current"
            : trip.status === "draft"
              ? "Draft"
              : "Watching prices"}
        </span>
        <StatusBadge status={trip.status} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="m-0 font-medium"
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: "22px",
            letterSpacing: "-0.01em",
            color: "var(--color-ink-900, #2A1E15)",
          }}
        >
          {trip.title}
        </h2>
        {flightsLocked && (
          <span
            className="font-bold font-mono text-sm"
            style={{
              color: "var(--color-coral-700, #B85633)",
              animation: "sfPriceTick .8s ease both",
            }}
          >
            $1,242
          </span>
        )}
      </div>
      <div
        className="flex items-center gap-3 mt-1.5 text-xs"
        style={{ color: "var(--color-ink-500, #968471)" }}
      >
        <span
          style={{ fontFamily: "'Geist Mono', monospace", color: "var(--color-ink-900, #2A1E15)" }}
        >
          {trip.originAirport} → {destination}
        </span>
        <span style={{ color: "var(--color-ink-400, #B6A593)" }}>·</span>
        <span>
          {fmt(start)} – {fmt(end)}
        </span>
        <span style={{ color: "var(--color-ink-400, #B6A593)" }}>·</span>
        <span>{durationDays}d</span>
        {trip.flexibilityDays > 0 && (
          <>
            <span style={{ color: "var(--color-ink-400, #B6A593)" }}>·</span>
            <span>±{trip.flexibilityDays}d flex</span>
          </>
        )}
        {trip.userId && (
          <>
            <span style={{ color: "var(--color-ink-400, #B6A593)" }}>·</span>
            <span>2 travelers</span>
          </>
        )}
        {hint && hint.active && (
          <>
            <span style={{ color: "var(--color-ink-400, #B6A593)" }}>·</span>
            <span style={{ color: "var(--color-teal-600, #2FA5A1)" }}>{hint.text}</span>
          </>
        )}
      </div>
    </div>
  );
}
