"use client";

import { useState } from "react";
import { renderInline, renderMarkdown } from "@/lib/plan/markdown";
import type { ParsedDay } from "@/lib/plan/parse";

interface DayCardProps {
  day: ParsedDay;
  onRefine?: (prefill: string) => void;
  onPatch?: (message: string) => void;
}

const BULLET_RE = /^([-*])\s+(.*)$/;

export function DayCard({ day, onRefine, onPatch }: DayCardProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const lines = day.body.split("\n");
  const heading = day.title ? `Day ${day.number} — ${day.title}` : `Day ${day.number}`;

  function startEdit(idx: number, originalText: string) {
    setEditingIdx(idx);
    setDraft(originalText);
  }

  function cancelEdit() {
    setEditingIdx(null);
    setDraft("");
  }

  function saveEdit(idx: number, originalLine: string) {
    const next = draft.trim();
    if (!next || !onPatch) {
      cancelEdit();
      return;
    }
    const originalText = originalLine.replace(BULLET_RE, "$2").trim();
    if (next === originalText) {
      cancelEdit();
      return;
    }
    onPatch(`Update ${heading}: change "${originalText}" → "${next}"`);
    cancelEdit();
    void idx;
  }

  return (
    <section className="rounded-[14px] border border-line bg-cream-50 overflow-hidden">
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{
          background: "var(--color-cream-100, #FFF6DE)",
          borderColor: "var(--color-line, #EFE4C8)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-bold shrink-0"
            style={{
              background: "var(--color-coral-500, #F48F68)",
              color: "var(--color-ink-900, #2A1E15)",
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            {day.number}
          </span>
          <h3
            className="text-sm font-semibold truncate"
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              letterSpacing: "-0.01em",
              color: "var(--color-ink-900, #2A1E15)",
            }}
          >
            {day.title || `Day ${day.number}`}
          </h3>
        </div>
        {onRefine && (
          <button
            type="button"
            onClick={() => onRefine(`Refine Day ${day.number}: `)}
            className="shrink-0 text-[11px] font-medium hover:bg-coral-100 px-2 py-1 rounded-full transition-colors"
            style={{ color: "var(--color-coral-700, #B85633)" }}
          >
            Refine ↗
          </button>
        )}
      </header>
      <div className="px-4 py-3 text-sm" style={{ color: "var(--color-ink-800, #4A3A2E)" }}>
        {lines.length === 0 || day.body.trim() === "" ? (
          <p className="text-ink-400 italic text-xs">No details yet.</p>
        ) : (
          <DayBody
            lines={lines}
            editingIdx={editingIdx}
            draft={draft}
            onStartEdit={startEdit}
            onCancel={cancelEdit}
            onSave={saveEdit}
            onDraftChange={setDraft}
            interactive={!!onPatch}
          />
        )}
      </div>
    </section>
  );
}

interface DayBodyProps {
  lines: string[];
  editingIdx: number | null;
  draft: string;
  onStartEdit: (idx: number, original: string) => void;
  onCancel: () => void;
  onSave: (idx: number, original: string) => void;
  onDraftChange: (v: string) => void;
  interactive: boolean;
}

function DayBody({
  lines,
  editingIdx,
  draft,
  onStartEdit,
  onCancel,
  onSave,
  onDraftChange,
  interactive,
}: DayBodyProps) {
  type ListGroup = {
    kind: "list";
    idxStart: number;
    items: Array<{ idx: number; raw: string; text: string }>;
  };
  type OtherGroup = { kind: "other"; idx: number; content: string };
  const out: Array<ListGroup | OtherGroup> = [];
  let list: ListGroup | null = null;
  let otherBuf: string[] = [];
  let otherStart = -1;

  function flushOther() {
    if (otherBuf.length === 0) return;
    out.push({ kind: "other", idx: otherStart, content: otherBuf.join("\n") });
    otherBuf = [];
    otherStart = -1;
  }
  function flushList() {
    if (list) {
      out.push(list);
      list = null;
    }
  }

  lines.forEach((line, idx) => {
    const m = BULLET_RE.exec(line);
    if (m) {
      flushOther();
      if (!list) list = { kind: "list", idxStart: idx, items: [] };
      list.items.push({ idx, raw: line, text: m[2]!.trim() });
    } else {
      flushList();
      if (otherStart === -1) otherStart = idx;
      otherBuf.push(line);
    }
  });
  flushList();
  flushOther();

  return (
    <div className="space-y-2">
      {out.map((g, gi) => {
        if (g.kind === "list") {
          return (
            <ul key={`l-${gi}`} className="space-y-1.5">
              {g.items.map((item) => {
                const isEditing = editingIdx === item.idx;
                if (isEditing) {
                  return (
                    <li key={item.idx} className="flex items-start gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral-500 mt-[7px] shrink-0" />
                      <div className="flex-1">
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={(e) => onDraftChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              onSave(item.idx, item.raw);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              onCancel();
                            }
                          }}
                          rows={2}
                          className="w-full text-sm border border-cream-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => onSave(item.idx, item.raw)}
                            className="text-[11px] font-semibold text-ink-900 bg-coral-500 hover:bg-coral-600 px-2 py-0.5 rounded"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={onCancel}
                            className="text-[11px] text-ink-500 hover:text-ink-700"
                          >
                            Cancel
                          </button>
                          <span className="text-[10px] text-ink-400 ml-auto">
                            ⌘↵ to save · Esc to cancel
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                }
                return (
                  <li
                    key={item.idx}
                    className={`flex items-start gap-2 group ${
                      interactive
                        ? "cursor-text hover:bg-cream-50 rounded -mx-1 px-1 transition-colors"
                        : ""
                    }`}
                    onClick={() => interactive && onStartEdit(item.idx, item.text)}
                    title={interactive ? "Click to edit" : undefined}
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral-500 mt-[7px] shrink-0" />
                    <span className="flex-1">{renderInline(item.text)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }
        return (
          <div key={`o-${gi}`} className="prose prose-sm max-w-none text-ink-800">
            {renderMarkdown(g.content)}
          </div>
        );
      })}
    </div>
  );
}
