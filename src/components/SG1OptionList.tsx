"use client";

import type { SG1Option } from "@/types";

interface SG1OptionListProps {
  options: SG1Option[];
  onSelect: (optionId: string) => void;
  selectedId?: string;
  loading?: boolean;
}

export function SG1OptionList({ options, onSelect, selectedId, loading }: SG1OptionListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-cream-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!options.length) {
    return (
      <p className="text-ink-400 text-center py-8">
        No trip options generated yet. Click &quot;Generate Options&quot; to start.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="sg1-option-list">
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        return (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            data-testid={`sg1-option-${option.id}`}
            className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${
              isSelected
                ? "border-coral-500 bg-coral-100"
                : "border-line bg-white hover:border-coral-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink-900">
                  {option.entryCity} → {option.exitCity}
                </p>
                <p className="text-sm text-coral-700 font-medium mt-0.5">{option.theme}</p>
                {option.description && (
                  <p className="text-sm text-ink-500 mt-1">{option.description}</p>
                )}
              </div>
              <div className="text-right text-xs text-ink-400 shrink-0 ml-4 font-mono">
                <p>{option.airports.entry}</p>
                <p>→ {option.airports.exit}</p>
                <p className="mt-1">
                  {option.approximateDates.start} – {option.approximateDates.end}
                </p>
              </div>
            </div>
            {isSelected && <p className="text-xs text-coral-700 font-medium mt-2">Selected</p>}
          </button>
        );
      })}
    </div>
  );
}
