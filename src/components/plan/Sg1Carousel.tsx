"use client";

import type { SG1Option } from "@/types";

interface Sg1CarouselProps {
  options: SG1Option[];
  selectedId: string | null;
  onSelect?: (option: SG1Option) => void;
}

export function Sg1Carousel({ options, selectedId, onSelect }: Sg1CarouselProps) {
  if (options.length === 0) return null;

  return (
    <div className="border border-line rounded-xl bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-500">Trip themes</h4>
        <span className="text-[10px] text-ink-400">
          {options.length} option{options.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {options.map((opt) => {
          const selected = opt.id === selectedId;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect?.(opt)}
              disabled={!onSelect || selected}
              className={`shrink-0 w-48 text-left rounded-lg border px-3 py-2 transition-colors ${
                selected
                  ? "border-coral-500 bg-coral-100"
                  : "border-line bg-cream-50 hover:bg-cream-100 hover:border-cream-300"
              } ${onSelect && !selected ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-coral-700 truncate">{opt.theme}</span>
                {selected && (
                  <span className="text-[9px] font-mono uppercase tracking-wider text-coral-700">
                    ✓ current
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-ink-700 uppercase tracking-wider truncate">
                {opt.airports.entry} → {opt.airports.exit}
              </p>
              <p className="text-[10px] text-ink-500 mt-0.5 truncate">
                {opt.approximateDates.start} → {opt.approximateDates.end}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
