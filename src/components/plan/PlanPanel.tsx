"use client";

import { forwardRef, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/plan/markdown";
import { isEmptyParsed, parsePlan, type ParsedDay, type ParsedPlan } from "@/lib/plan/parse";
import type { Trip } from "@/types";
import { DayCard } from "./DayCard";
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
  const [active, setActive] = useState<Tab>(() => firstAvailableTab(tabs));

  // If the active tab becomes unavailable (e.g. plan cleared), fall back.
  const currentTab: Tab = tabs[active] ? active : firstAvailableTab(tabs);

  const empty = isEmptyParsed(parsed);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--color-cream-50, #FFFAEC)",
        borderLeft: "1px solid var(--color-line, #EFE4C8)",
      }}
    >
      <PlanHeader trip={trip} hint={quoteHint} />
      <TabBar active={currentTab} tabs={tabs} onChange={setActive} daysCount={parsed.days.length} />
      <div ref={ref} data-testid="plan-content" className="flex-1 overflow-y-auto px-5 py-[18px]">
        {empty ? (
          <EmptyState />
        ) : (
          <div className="px-5 py-4">
            {currentTab === "overview" && <OverviewTab parsed={parsed} />}
            {currentTab === "flights" && <FlightsTab markdown={parsed.flights} />}
            {currentTab === "days" && (
              <DaysTab days={parsed.days} onRefine={onRefine} onPatch={onPatch} />
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
    flights: !!parsed.flights,
    days: parsed.days.length > 0,
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
}: {
  active: Tab;
  tabs: Record<Tab, boolean>;
  onChange: (t: Tab) => void;
  daysCount: number;
}) {
  const items: Array<{ key: Tab; label: string; badge?: string }> = [
    { key: "overview", label: "Overview" },
    { key: "flights", label: "Flights" },
    { key: "days", label: "Days", badge: daysCount > 0 ? String(daysCount) : undefined },
    { key: "notes", label: "Notes" },
  ];
  return (
    <div
      className="flex items-center gap-1 border-b px-3.5 overflow-x-auto"
      style={{
        background: "var(--color-cream-50, #FFFAEC)",
        borderColor: "var(--color-line, #EFE4C8)",
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

function OverviewTab({ parsed }: { parsed: ParsedPlan }) {
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
    </div>
  );
}

function FlightsTab({ markdown }: { markdown: string }) {
  if (!markdown) {
    return (
      <EmptySection label="No flights yet — Skyframe will fetch options after the trip basics are set." />
    );
  }
  return (
    <div className="prose prose-sm max-w-none text-ink-800 selection:bg-coral-200">
      {renderMarkdown(markdown)}
    </div>
  );
}

function DaysTab({
  days,
  onRefine,
  onPatch,
}: {
  days: ParsedDay[];
  onRefine?: (prefill: string) => void;
  onPatch?: (message: string) => void;
}) {
  if (days.length === 0) {
    return <EmptySection label='Tell the chat "build the days" once your flights are locked in.' />;
  }
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <DayCard key={d.number} day={d} onRefine={onRefine} onPatch={onPatch} />
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
