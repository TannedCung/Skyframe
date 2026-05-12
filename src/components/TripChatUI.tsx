"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/agent/trip-planner";

interface Message {
  role: "user" | "model";
  content: string;
  streaming?: boolean;
}

interface TripChatUIProps {
  /** Existing trip ID. If omitted, a draft trip is created on first message. */
  initialTripId?: string;
  /** Persisted chat history to hydrate the conversation. */
  initialMessages?: ChatMessage[];
  /** Persisted draft plan markdown to render in the plan panel. */
  initialPlanMarkdown?: string | null;
  /** Navigate away when the agent finalises (used on /trip/new). */
  redirectOnFinalize?: boolean;
}

const GREETING: Message = {
  role: "model",
  content: "Hi! Where would you like to go?",
};

const SPLIT_STORAGE_KEY = "skyframe:splitRatio";

export function TripChatUI({
  initialTripId,
  initialMessages,
  initialPlanMarkdown,
  redirectOnFinalize = false,
}: TripChatUIProps = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return initialMessages.map((m) => ({ role: m.role, content: m.content }));
    }
    return [GREETING];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tripId, setTripId] = useState<string | null>(initialTripId ?? null);
  const [planMarkdown, setPlanMarkdown] = useState<string | null>(initialPlanMarkdown ?? null);
  const [quoteHint, setQuoteHint] = useState(false);
  const [chatRatio, setChatRatio] = useState(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(SPLIT_STORAGE_KEY) : null;
    return stored ? clampRatio(parseFloat(stored)) : 0.4;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const planPanelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  function clampRatio(v: number) {
    return Math.min(0.6, Math.max(0.25, v));
  }

  // Draggable divider
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMove = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const clamped = clampRatio(ratio);
      setChatRatio(clamped);
      localStorage.setItem(SPLIT_STORAGE_KEY, String(clamped));
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      onMove(e.clientX);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      onMove(e.touches[0]!.clientX);
    };

    const onTouchEnd = onMouseUp;

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Ctrl+L → if selection is inside plan panel, insert it as a blockquote in the input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "l") return;

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || !selection || selection.rangeCount === 0) return;

      const anchor = selection.anchorNode;
      if (!anchor || !planPanelRef.current?.contains(anchor)) return;

      e.preventDefault();
      const quoted = text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${quoted}\n\n` : `${quoted}\n\n`));
      selection.removeAllRanges();
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Show a transient hint when user has a selection inside the plan panel
  useEffect(() => {
    if (!planMarkdown) return;
    function onSelectionChange() {
      const sel = window.getSelection();
      const has = !!sel?.toString().trim();
      const inside = !!(sel?.anchorNode && planPanelRef.current?.contains(sel.anchorNode));
      setQuoteHint(has && inside);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [planMarkdown]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "model", content: "", streaming: true }]);

    const chatHistory: ChatMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/trips/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory, tripId }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event.type === "trip_created") {
            setTripId(event.tripId as string);
          } else if (event.type === "plan_update") {
            setPlanMarkdown(event.markdown as string);
          } else if (event.type === "text") {
            const delta = event.delta as string;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "model") {
                next[next.length - 1] = { ...last, content: last.content + delta };
              }
              return next;
            });
          } else if (event.type === "done") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "model") {
                next[next.length - 1] = { ...last, streaming: false };
              }
              return next;
            });
            const redirect = event.redirect as string | undefined;
            if (redirect && redirectOnFinalize) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setTimeout(() => router.push(redirect as any), 1000);
            }
          } else if (event.type === "error") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "model") {
                next[next.length - 1] = {
                  ...last,
                  content: (event.message as string) ?? "Something went wrong.",
                  streaming: false,
                };
              }
              return next;
            });
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "model") {
          next[next.length - 1] = {
            ...last,
            content: "Sorry, something went wrong. Please try again.",
            streaming: false,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, tripId, router, redirectOnFinalize]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const renderedPlan = useMemo(
    () => (planMarkdown ? renderMarkdown(planMarkdown) : null),
    [planMarkdown],
  );

  const showPlan = !!planMarkdown;

  const renderedMessages = useMemo(
    () =>
      messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-coral-500 text-ink-900 whitespace-pre-wrap"
                : "bg-white border border-line text-ink-800"
            }`}
          >
            {msg.content ? (
              msg.role === "model" ? (
                renderMarkdown(msg.content)
              ) : (
                msg.content
              )
            ) : msg.streaming ? (
              <span className="inline-flex gap-1 text-ink-400">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
                  •
                </span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                  •
                </span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                  •
                </span>
              </span>
            ) : null}
          </div>
        </div>
      )),
    [messages],
  );

  const chatPanel = (
    <div data-testid="chat-panel" className="flex flex-col h-full bg-cream-100">
      <div className="flex-1 overflow-y-auto py-4 space-y-4 px-4 sm:px-6">
        {renderedMessages}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-line bg-white px-4 sm:px-6 pt-3 pb-4">
        <div className="flex gap-3 items-end max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              showPlan
                ? "Reply, or select text in the plan and press Ctrl+L to quote it…"
                : "Type a message… (Enter to send)"
            }
            className="flex-1 resize-none border border-cream-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50 max-h-40 overflow-y-auto"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            data-testid="chat-send"
            className="bg-coral-500 text-ink-900 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-coral-600 transition-colors disabled:opacity-40 shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );

  const planPanel = (
    <div className="flex flex-col h-full bg-white border-l border-line">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-cream-50">
        <h2 className="display-tight text-sm font-semibold text-ink-900 tracking-wide uppercase">
          Trip Plan (Draft)
        </h2>
        <span
          className={`text-xs transition-opacity ${
            quoteHint ? "opacity-100 text-teal-600" : "opacity-50 text-ink-500"
          }`}
        >
          Select text · Ctrl+L to quote
        </span>
      </div>
      <div
        ref={planPanelRef}
        data-testid="plan-content"
        className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none text-ink-800 selection:bg-coral-200"
      >
        {renderedPlan}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <div
        className="grid h-full transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: showPlan
            ? `${chatRatio * 100}% ${(1 - chatRatio) * 100}%`
            : "100% 0%",
        }}
      >
        <div className="min-w-0 overflow-hidden">
          <div className={showPlan ? "w-full h-full" : "max-w-3xl mx-auto h-full"}>{chatPanel}</div>
        </div>
        <div
          data-testid={showPlan ? "plan-panel" : undefined}
          aria-hidden={!showPlan}
          className={`min-w-0 overflow-hidden transition-opacity duration-300 ease-out ${
            showPlan ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {showPlan && planPanel}
        </div>
      </div>
      {showPlan && (
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          className="absolute top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-teal-400/30 active:bg-teal-400/40 transition-colors z-10"
          style={{
            left: `calc(${chatRatio * 100}% - 3px)`,
          }}
        />
      )}
    </div>
  );
}

// ─── Tiny markdown renderer (headings, lists, bold/italic/code, paragraphs) ───

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let tableRows: string[][] = [];
  let tableHeader: string[] = [];

  function flushTable() {
    if (tableHeader.length === 0) return;
    out.push(
      <div key={`tbl-${out.length}`} className="my-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-cream-100">
              {tableHeader.map((h, i) => (
                <th key={i} className="border border-line px-3 py-2 text-left font-semibold">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-cream-50"}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-line px-3 py-2">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableHeader = [];
    tableRows = [];
  }

  function flushList() {
    if (listBuffer.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc pl-6 my-2 space-y-1">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function flushPara() {
    if (paraBuffer.length === 0) return;
    out.push(
      <p key={`p-${out.length}`} className="my-2 leading-relaxed">
        {renderInline(paraBuffer.join(" "))}
      </p>,
    );
    paraBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushTable();
      flushList();
      flushPara();
      continue;
    }

    // Table separator row: |---|---|---|
    if (/^\|[\s-:|]+\|$/.test(line)) {
      continue;
    }

    // Table row: | cell | cell | cell |
    const tableMatch = /^\|(.+)\|$/.exec(line);
    if (tableMatch) {
      flushList();
      flushPara();
      const cells = tableMatch[1]!.split("|").map((c) => c.trim());
      if (tableHeader.length === 0) {
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    }

    // If we were building a table but hit a non-table line, flush it
    if (tableHeader.length > 0) {
      flushTable();
    }

    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    const bq = /^>\s+(.*)$/.exec(line);

    if (h1 || h2 || h3) {
      flushList();
      flushPara();
      if (h1) {
        out.push(
          <h1 key={`h-${out.length}`} className="display-tight text-2xl font-bold mt-4 mb-3">
            {renderInline(h1[1]!)}
          </h1>,
        );
      } else if (h2) {
        out.push(
          <h2 key={`h-${out.length}`} className="display-tight text-lg font-semibold mt-4 mb-2">
            {renderInline(h2[1]!)}
          </h2>,
        );
      } else if (h3) {
        out.push(
          <h3
            key={`h-${out.length}`}
            className="text-sm font-semibold uppercase tracking-wide text-ink-700 mt-3 mb-1"
          >
            {renderInline(h3[1]!)}
          </h3>,
        );
      }
      continue;
    }

    if (li) {
      flushPara();
      listBuffer.push(li[1]!);
      continue;
    }

    if (bq) {
      flushList();
      flushPara();
      out.push(
        <blockquote
          key={`bq-${out.length}`}
          className="border-l-4 border-teal-400 pl-3 py-1 my-2 text-ink-600 italic"
        >
          {renderInline(bq[1]!)}
        </blockquote>,
      );
      continue;
    }

    flushList();
    paraBuffer.push(line);
  }

  flushTable();
  flushList();
  flushPara();
  return out;
}

function renderInline(text: string): React.ReactNode {
  // Order matters: code first (won't be re-parsed), then bold, then italic.
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns: Array<{ re: RegExp; render: (m: RegExpExecArray) => React.ReactNode }> = [
    {
      re: /`([^`]+)`/,
      render: (m) => (
        <code key={key++} className="bg-cream-200 rounded px-1 text-[0.85em]">
          {m[1]}
        </code>
      ),
    },
    { re: /\*\*([^*]+)\*\*/, render: (m) => <strong key={key++}>{m[1]}</strong> },
    { re: /\*([^*]+)\*/, render: (m) => <em key={key++}>{m[1]}</em> },
  ];

  while (remaining.length > 0) {
    let earliest: {
      match: RegExpExecArray;
      render: (m: RegExpExecArray) => React.ReactNode;
    } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(remaining);
      if (m && (earliest === null || m.index < earliest.match.index)) {
        earliest = { match: m, render: p.render };
      }
    }
    if (!earliest) {
      parts.push(remaining);
      break;
    }
    if (earliest.match.index > 0) {
      parts.push(remaining.slice(0, earliest.match.index));
    }
    parts.push(earliest.render(earliest.match));
    remaining = remaining.slice(earliest.match.index + earliest.match[0].length);
  }

  return parts;
}
