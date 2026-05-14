"use client";

import { forwardRef, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/plan/markdown";
import { isEmptyParsed, parsePlan, type ParsedDay, type ParsedPlan } from "@/lib/plan/parse";
import type { Itinerary, SG1Option, Trip } from "@/types";
import { DayCard } from "./DayCard";
import { PlanHeader } from "./PlanHeader";
import { Sg1Carousel } from "./Sg1Carousel";

type Tab = "overview" | "flights" | "days" | "notes" | "versions";

interface PlanPanelProps {
  markdown: string | null;
  trip: Trip | null;
  sg1Options: SG1Option[];
  selectedSg1Id: string | null;
  versions: Itinerary[];
  onRefine?: (prefill: string) => void;
  onPatch?: (message: string) => void;
  quoteHint?: { active: boolean; text: string };
}

export const PlanPanel = forwardRef<HTMLDivElement, PlanPanelProps>(function PlanPanel(
  { markdown, trip, sg1Options, selectedSg1Id, versions, onRefine, onPatch, quoteHint },
  ref,
) {
  const parsed = useMemo<ParsedPlan>(() => parsePlan(markdown ?? ""), [markdown]);
  const tabs = useTabAvailability(parsed, sg1Options.length, versions.length);
  const [active, setActive] = useState<Tab>(() => firstAvailableTab(tabs));

  // If the active tab becomes unavailable (e.g. plan cleared), fall back.
  const currentTab: Tab = tabs[active] ? active : firstAvailableTab(tabs);

  const empty = isEmptyParsed(parsed) && sg1Options.length === 0;

  const currentVersion = versions.find((v) => v.status === "current") ?? versions[0] ?? null;
  const versionLabel = currentVersion ? `v${currentVersion.version}` : null;

  return (
    <div className="flex flex-col h-full bg-white border-l border-line">
      <PlanHeader trip={trip} versionLabel={versionLabel} hint={quoteHint} />
      <TabBar
        active={currentTab}
        tabs={tabs}
        onChange={setActive}
        daysCount={parsed.days.length}
        versionsCount={versions.length}
      />
      <div ref={ref} data-testid="plan-content" className="flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState />
        ) : (
          <div className="px-5 py-4">
            {currentTab === "overview" && (
              <OverviewTab
                parsed={parsed}
                sg1Options={sg1Options}
                selectedSg1Id={selectedSg1Id}
                onSelectSg1={
                  onPatch
                    ? (opt) =>
                        onPatch(
                          `Switch to the "${opt.theme}" trip option (${opt.airports.entry} → ${opt.airports.exit}, ${opt.approximateDates.start} → ${opt.approximateDates.end}).`,
                        )
                    : undefined
                }
              />
            )}
            {currentTab === "flights" && <FlightsTab markdown={parsed.flights} />}
            {currentTab === "days" && (
              <DaysTab days={parsed.days} onRefine={onRefine} onPatch={onPatch} />
            )}
            {currentTab === "notes" && <NotesTab markdown={parsed.notes || parsed.unknown} />}
            {currentTab === "versions" && (
              <VersionsTab versions={versions} currentId={currentVersion?.id ?? null} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function useTabAvailability(
  parsed: ParsedPlan,
  sg1Count: number,
  versionsCount: number,
): Record<Tab, boolean> {
  return {
    overview:
      !!parsed.brief ||
      !!parsed.destinations ||
      !!parsed.mustHave ||
      !!parsed.title ||
      sg1Count > 0,
    flights: !!parsed.flights,
    days: parsed.days.length > 0,
    notes: !!parsed.notes || !!parsed.unknown,
    versions: versionsCount > 0,
  };
}

function firstAvailableTab(tabs: Record<Tab, boolean>): Tab {
  const order: Tab[] = ["overview", "flights", "days", "notes", "versions"];
  return order.find((t) => tabs[t]) ?? "overview";
}

function TabBar({
  active,
  tabs,
  onChange,
  daysCount,
  versionsCount,
}: {
  active: Tab;
  tabs: Record<Tab, boolean>;
  onChange: (t: Tab) => void;
  daysCount: number;
  versionsCount: number;
}) {
  const items: Array<{ key: Tab; label: string; badge?: string }> = [
    { key: "overview", label: "Overview" },
    { key: "flights", label: "Flights" },
    { key: "days", label: "Days", badge: daysCount > 0 ? String(daysCount) : undefined },
    { key: "notes", label: "Notes" },
    {
      key: "versions",
      label: "Versions",
      badge: versionsCount > 0 ? String(versionsCount) : undefined,
    },
  ];
  return (
    <div className="flex items-center gap-0.5 border-b border-line bg-white px-3 overflow-x-auto">
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
  sg1Options,
  selectedSg1Id,
  onSelectSg1,
}: {
  parsed: ParsedPlan;
  sg1Options: SG1Option[];
  selectedSg1Id: string | null;
  onSelectSg1?: (opt: SG1Option) => void;
}) {
  return (
    <div className="space-y-4">
      {parsed.title && (
        <h1 className="display-tight text-xl font-bold text-ink-900">{parsed.title}</h1>
      )}
      {sg1Options.length > 0 && (
        <Sg1Carousel options={sg1Options} selectedId={selectedSg1Id} onSelect={onSelectSg1} />
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

function VersionsTab({ versions, currentId }: { versions: Itinerary[]; currentId: string | null }) {
  if (versions.length === 0) return <EmptySection label="No versions yet." />;
  return (
    <ol className="space-y-2">
      {versions.map((v) => {
        const isCurrent = v.id === currentId;
        return (
          <li
            key={v.id}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              isCurrent ? "border-coral-500 bg-coral-50" : "border-line bg-white"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  isCurrent ? "bg-coral-500 text-ink-900" : "bg-cream-200 text-ink-700"
                }`}
              >
                v{v.version}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900 truncate">
                  {new Date(v.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-ink-500">
                  {v.cheapestTotalPrice
                    ? `${v.currency} ${v.cheapestTotalPrice.toLocaleString()}`
                    : "—"}
                </p>
              </div>
            </div>
            {isCurrent ? (
              <span className="text-[10px] font-mono uppercase tracking-wider text-coral-700">
                current
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
                {v.status}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
        {label}
      </h3>
      {children}
    </section>
  );
}

function EmptySection({ label }: { label: string }) {
  return <p className="text-sm text-ink-400 italic">{label}</p>;
}
