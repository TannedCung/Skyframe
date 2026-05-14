"use client";

import { forwardRef, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/plan/markdown";
import { isEmptyParsed, parsePlan, type ParsedDay, type ParsedPlan } from "@/lib/plan/parse";
import type { Trip } from "@/types";
import { DayCard } from "./DayCard";
import { FlightRow } from "./FlightRow";
import { PlanHeader } from "./PlanHeader";

type Tab = "overview" | "flights" | "days" | "notes";

interface PlanPanelProps {
  markdown: string | null;
  trip: Trip | null;
  onRefine?: (prefill: string) => void;
  onPatch?: (message: string) => void;
  quoteHint?: { active: boolean; text: string };
}

export const PlanPanel = forwardRef<HTMLDivElement, PlanPanelProps>(function PlanPanel(
  { markdown, trip, onRefine, onPatch, quoteHint },
  ref,
) {
  const parsed = useMemo<ParsedPlan>(() => parsePlan(markdown ?? ""), [markdown]);
  const tabs = useTabAvailability(parsed);

  // Derive "flights locked" from whether flight markdown exists
  const flightsLocked = !!parsed.flights;
  const daysBuilt = parsed.days.length > 0;

  // Track preferred tab explicitly; auto-select based on plan state without cascading setState.
  const [preferredTab, setPreferredTab] = useState<Tab | null>(null);
  const resolvedTab = preferredTab ?? (daysBuilt ? "days" : flightsLocked ? "flights" : "overview");
  const currentTab: Tab = tabs[resolvedTab] ? resolvedTab : firstAvailableTab(tabs);

  const empty = isEmptyParsed(parsed);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--color-cream-50, #FFFAEC)",
        borderLeft: "1px solid var(--color-line, #EFE4C8)",
      }}
    >
      <PlanHeader trip={trip} hint={quoteHint} flightsLocked={flightsLocked} />
      <TabBar
        active={currentTab}
        tabs={tabs}
        onChange={setPreferredTab}
        daysCount={parsed.days.length}
        flightsLocked={flightsLocked}
      />
      <div
        ref={ref}
        data-testid="plan-content"
        className="flex-1 overflow-y-auto"
        style={{ padding: "18px 22px" }}
      >
        {empty ? (
          <EmptyState />
        ) : (
          <div className="px-5 py-4">
            {currentTab === "overview" && (
              <OverviewTab
                parsed={parsed}
                flightsLocked={flightsLocked}
                daysBuilt={daysBuilt}
                onLockFlights={() =>
                  onPatch?.("Lock this sketch — get the best afternoon arrival fare")
                }
                onBuildDays={() => onPatch?.("Build the days")}
              />
            )}
            {currentTab === "flights" && (
              <FlightsTab
                markdown={parsed.flights}
                flightsLocked={flightsLocked}
                daysBuilt={daysBuilt}
                onLockFlights={() =>
                  onPatch?.("Lock this sketch — get the best afternoon arrival fare")
                }
                onBuildDays={() => onPatch?.("Build the days")}
              />
            )}
            {currentTab === "days" && (
              <DaysTab
                days={parsed.days}
                daysBuilt={daysBuilt}
                onRefine={onRefine}
                onPatch={onPatch}
                onBuildDays={() => onPatch?.("Build the days")}
              />
            )}
            {currentTab === "notes" && <NotesTab markdown={parsed.notes || parsed.unknown} />}
          </div>
        )}
      </div>
    </div>
  );
});

function useTabAvailability(parsed: ParsedPlan): Record<Tab, boolean> {
  return {
    overview: !!parsed.brief || !!parsed.destinations || !!parsed.mustHave || !!parsed.title,
    flights: true, // always show flights tab once overview exists
    days: true, // always show days tab once overview exists
    notes: !!parsed.notes || !!parsed.unknown,
  };
}

function firstAvailableTab(tabs: Record<Tab, boolean>): Tab {
  const order: Tab[] = ["overview", "flights", "days", "notes"];
  return order.find((t) => tabs[t]) ?? "overview";
}

function TabBar({
  active,
  tabs,
  onChange,
  daysCount,
  flightsLocked,
}: {
  active: Tab;
  tabs: Record<Tab, boolean>;
  onChange: (t: Tab) => void;
  daysCount: number;
  flightsLocked: boolean;
}) {
  const items: Array<{ key: Tab; label: string; badge?: string }> = [
    { key: "overview", label: "Overview" },
    { key: "flights", label: "Flights", badge: flightsLocked ? "✓" : undefined },
    { key: "days", label: "Days", badge: daysCount > 0 ? String(daysCount) : undefined },
    { key: "notes", label: "Notes" },
  ];
  return (
    <div
      className="flex items-center gap-1 border-b px-3.5 overflow-x-auto"
      style={{
        background: "var(--color-cream-50, #FFFAEC)",
        borderColor: "var(--color-line, #EFE4C8)",
        gap: "4px",
      }}
    >
      {items.map((item) => {
        const available = tabs[item.key];
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            disabled={!available}
            onClick={() => available && onChange(item.key)}
            className={`relative shrink-0 text-xs font-medium px-3 py-2.5 transition-colors ${
              isActive
                ? "text-ink-900"
                : available
                  ? "text-ink-500 hover:text-ink-900"
                  : "text-ink-300 cursor-not-allowed"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {item.label}
              {item.badge && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-coral-500 text-ink-900" : "bg-cream-200 text-ink-700"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </span>
            {isActive && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-coral-500 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center p-10 text-center">
      <div className="max-w-xs">
        <p className="text-sm text-ink-500 mb-2">Your trip plan is empty.</p>
        <p className="text-xs text-ink-400">
          Tell Skyframe where you want to go in the chat — the plan will appear here as we go.
        </p>
      </div>
    </div>
  );
}

function OverviewTab({
  parsed,
  flightsLocked,
  daysBuilt,
  onLockFlights,
  onBuildDays,
}: {
  parsed: ParsedPlan;
  flightsLocked: boolean;
  daysBuilt: boolean;
  onLockFlights: () => void;
  onBuildDays: () => void;
}) {
  return (
    <div className="space-y-4">
      {parsed.title && (
        <h1 className="display-tight text-xl font-bold text-ink-900">{parsed.title}</h1>
      )}
      {parsed.brief && (
        <Section label="Brief">
          <div className="prose prose-sm max-w-none text-ink-800">
            {renderMarkdown(parsed.brief)}
          </div>
        </Section>
      )}
      {parsed.destinations && (
        <Section label="Destinations">
          <div className="prose prose-sm max-w-none text-ink-800">
            {renderMarkdown(parsed.destinations)}
          </div>
        </Section>
      )}
      {parsed.mustHave && (
        <Section label="Must-have">
          <div className="prose prose-sm max-w-none text-ink-800">
            {renderMarkdown(parsed.mustHave)}
          </div>
        </Section>
      )}

      {/* Next step CTA — matches prototype Lock No2 flow */}
      {!flightsLocked && (
        <NextStepCard
          mono="Next step · Lock the flight"
          body="We're watching the route. Once locked, we'll fetch live fares and build the day-by-day plan."
          buttonLabel="Lock sketch"
          onClick={onLockFlights}
        />
      )}
      {flightsLocked && !daysBuilt && (
        <NextStepCard
          mono="Next step · Build the days"
          body="Flights are locked. Skyframe will sketch a day-by-day plan based on your preferences."
          buttonLabel="Build the days"
          onClick={onBuildDays}
        />
      )}
    </div>
  );
}

function NextStepCard({
  mono,
  body,
  buttonLabel,
  onClick,
}: {
  mono: string;
  body: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div
      className="mt-4 p-4 px-5 rounded-[14px] border flex items-center gap-4"
      style={{
        background: "var(--color-cream-100, #FFF6DE)",
        borderColor: "var(--color-line, #EFE4C8)",
      }}
    >
      <div className="flex-1 min-w-0">
        <span className="mono-label block mb-1" style={{ color: "var(--color-ink-900, #2A1E15)" }}>
          {mono}
        </span>
        <p className="text-sm text-ink-700 m-0">{body}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="shrink-0 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-colors hover:opacity-90"
        style={{
          background: "var(--color-coral-500, #F48F68)",
          color: "var(--color-ink-900, #2A1E15)",
          borderColor: "transparent",
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function FlightsTab({
  markdown,
  flightsLocked,
  daysBuilt,
  onLockFlights,
  onBuildDays,
}: {
  markdown: string;
  flightsLocked: boolean;
  daysBuilt: boolean;
  onLockFlights: () => void;
  onBuildDays: () => void;
}) {
  if (!flightsLocked) {
    return (
      <div>
        <div
          className="p-5 rounded-[14px] border text-center"
          style={{
            borderStyle: "dashed",
            borderColor: "var(--color-line, #EFE4C8)",
            background: "var(--color-cream-50, #FFFAEC)",
          }}
        >
          <span className="mono-label">No flights yet</span>
          <p className="mt-2 text-sm text-ink-500">Lock a sketch to fetch live fares.</p>
          <button
            type="button"
            onClick={onLockFlights}
            className="mt-3 px-4 py-2 rounded-xl border font-semibold text-sm transition-colors hover:opacity-90"
            style={{
              background: "var(--color-coral-500, #F48F68)",
              color: "var(--color-ink-900, #2A1E15)",
              borderColor: "transparent",
            }}
          >
            Lock sketch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Locked flight card */}
      <div
        className="rounded-[14px] border border-line overflow-hidden bg-cream-50"
        style={{ animation: "sfFade .35s ease both" }}
      >
        <div className="px-[18px] py-3.5 flex items-center justify-between">
          <div>
            <span className="mono-label" style={{ color: "var(--color-ink-900, #2A1E15)" }}>
              Locked · Kiwi Tequila
            </span>
            <div className="text-xs text-ink-700 mt-0.5">Live fares · Economy</div>
          </div>
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--color-teal-800, #1F6E6B)" }}
          >
            ● refreshed just now
          </span>
        </div>

        {/* Render flight markdown if available, otherwise show placeholder rows */}
        {markdown ? (
          <div className="prose prose-sm max-w-none text-ink-800 px-[18px] pb-4">
            {renderMarkdown(markdown)}
          </div>
        ) : (
          <PlaceholderFlightRows />
        )}
      </div>

      {/* Price watch banner */}
      <div
        className="p-4 px-5 rounded-[14px] border"
        style={{
          background: "var(--color-yellow-300, #FFE394)",
          borderColor: "var(--color-yellow-300, #FFE394)",
          animation: "sfFade .35s ease both",
        }}
      >
        <span className="mono-label" style={{ color: "var(--color-ink-900, #2A1E15)" }}>
          ⌖ Price watch — active
        </span>
        <p
          className="mt-2 mb-0 text-sm leading-relaxed"
          style={{ color: "var(--color-ink-800, #4A3A2E)" }}
        >
          Skyframe re-checks every hour. We&apos;ll email you and rewrite the affected days if the
          price drops more than 5%.
        </p>
        <div
          className="mt-2.5 text-[11px] font-mono"
          style={{ color: "var(--color-ink-700, #6B5A4D)" }}
        >
          Last 24h: tracking · Watch threshold: ±5%
        </div>
      </div>

      {/* Build the days CTA */}
      {!daysBuilt && (
        <NextStepCard
          mono="Next step · Build the days"
          body="Flights are locked. Skyframe will sketch a day-by-day plan based on your preferences."
          buttonLabel="Build the days"
          onClick={onBuildDays}
        />
      )}
    </div>
  );
}

function PlaceholderFlightRows() {
  return (
    <>
      <FlightRow
        leg="OUT"
        code="JFK · 11:20 → HND · 16:40 +1"
        airline="ZipAir ZG 005"
        time="14h 20m"
        price="$612"
        note="1 stop ICN"
      />
      <FlightRow
        leg="RET"
        code="KIX · 17:15 → JFK · 13:55"
        airline="ANA NH 106"
        time="13h 40m"
        price="$630"
        note="nonstop"
      />
      <div
        className="flex justify-between px-[18px] py-3 border-t"
        style={{
          background: "var(--color-cream-100, #FFF6DE)",
          borderColor: "var(--color-line, #EFE4C8)",
        }}
      >
        <span className="text-sm text-ink-700">Total · per person</span>
        <span
          className="font-bold font-mono"
          style={{
            color: "var(--color-coral-700, #B85633)",
            animation: "sfPriceTick .8s ease both",
          }}
        >
          $1,242
        </span>
      </div>
    </>
  );
}

function DaysTab({
  days,
  daysBuilt,
  onRefine,
  onPatch,
  onBuildDays,
}: {
  days: ParsedDay[];
  daysBuilt: boolean;
  onRefine?: (prefill: string) => void;
  onPatch?: (message: string) => void;
  onBuildDays: () => void;
}) {
  if (!daysBuilt) {
    return (
      <div>
        <div
          className="p-5 rounded-[14px] border text-center"
          style={{
            borderStyle: "dashed",
            borderColor: "var(--color-line, #EFE4C8)",
            background: "var(--color-cream-50, #FFFAEC)",
          }}
        >
          <span className="mono-label">Days not built yet</span>
          <p className="mt-2 text-sm text-ink-500">
            Once flights lock, Skyframe sketches the days.
          </p>
          <button
            type="button"
            onClick={onBuildDays}
            className="mt-3 px-4 py-2 rounded-xl border font-semibold text-sm transition-colors hover:opacity-90"
            style={{
              background: "var(--color-coral-500, #F48F68)",
              color: "var(--color-ink-900, #2A1E15)",
              borderColor: "transparent",
            }}
          >
            Build the days
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {days.map((d, i) => (
        <div
          key={d.number}
          style={{
            animation: "sfFade .35s ease both",
            animationDelay: `${i * 60}ms`,
          }}
        >
          <DayCard day={d} onRefine={onRefine} onPatch={onPatch} />
        </div>
      ))}
    </div>
  );
}

function NotesTab({ markdown }: { markdown: string }) {
  if (!markdown) return <EmptySection label="No notes yet." />;
  return (
    <div className="prose prose-sm max-w-none text-ink-800 bg-yellow-100/40 rounded-xl border border-yellow-300/60 p-4">
      {renderMarkdown(markdown)}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <span className="mono-label block mb-1.5" style={{ color: "var(--color-ink-500, #968471)" }}>
        {label}
      </span>
      {children}
    </section>
  );
}

function EmptySection({ label }: { label: string }) {
  return <p className="text-sm text-ink-400 italic">{label}</p>;
}
