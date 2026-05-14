"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { renderMarkdown } from "@/lib/plan/markdown";
import { PlanPanel } from "@/components/plan/PlanPanel";
import type { ChatMessage } from "@/lib/agent/trip-planner";
import type { Trip } from "@/types";

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
  /** Trip details for the plan header. */
  trip?: Trip | null;
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
  trip = null,
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
  const planContentRef = useRef<HTMLDivElement>(null);
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
      if (!anchor || !planContentRef.current?.contains(anchor)) return;

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
      const inside = !!(sel?.anchorNode && planContentRef.current?.contains(sel.anchorNode));
      setQuoteHint(has && inside);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [planMarkdown]);

  // Shared streaming routine used by both manual send and structured patches.
  const streamMessage = useCallback(
    async (history: ChatMessage[]) => {
      setLoading(true);
      try {
        const res = await fetch("/api/trips/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, tripId }),
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
    },
    [tripId, router, redirectOnFinalize],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setMessages((prev) => [...prev, { role: "model", content: "", streaming: true }]);

    const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamMessage(history);
  }, [input, loading, messages, streamMessage]);

  // Pre-fill the textarea with a scoped prompt and focus it (Phase 2: Refine button).
  const prefillInput = useCallback((text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  // Send a structured user message directly, bypassing the textarea (Phase 3: inline edit).
  const sendPatch = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg, { role: "model", content: "", streaming: true }]);
      const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      await streamMessage(history);
    },
    [loading, messages, streamMessage],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const showPlan = !!planMarkdown;

  const renderedMessages = useMemo(
    () =>
      messages.map((msg, i) => {
        const isUser = msg.role === "user";
        return (
          <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[82%] px-4 py-3 rounded-[18px] text-sm"
              style={{
                background: isUser
                  ? "var(--color-coral-500, #F48F68)"
                  : "var(--color-cream-50, #FFFAEC)",
                border: isUser ? "none" : "1px solid var(--color-line, #EFE4C8)",
                color: "var(--color-ink-900, #2A1E15)",
                fontFamily: "'Geist', sans-serif",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {msg.content ? (
                msg.role === "model" ? (
                  renderMarkdown(msg.content)
                ) : (
                  msg.content
                )
              ) : msg.streaming ? (
                <span
                  className="inline-flex gap-1"
                  style={{ color: "var(--color-ink-400, #B6A593)" }}
                >
                  <span style={{ animation: "sfDot 1.2s infinite", animationDelay: "0ms" }}>•</span>
                  <span style={{ animation: "sfDot 1.2s infinite", animationDelay: "200ms" }}>
                    •
                  </span>
                  <span style={{ animation: "sfDot 1.2s infinite", animationDelay: "400ms" }}>
                    •
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        );
      }),
    [messages],
  );

  const chatPanel = (
    <div
      data-testid="chat-panel"
      className="flex flex-col h-full"
      style={{ background: "var(--color-cream-100, #FFF6DE)" }}
    >
      <div className="flex-1 overflow-y-auto space-y-3 px-6" style={{ padding: "20px 24px" }}>
        {renderedMessages}
        <div ref={bottomRef} />
      </div>
      <div
        className="border-t px-6 pt-3.5 pb-4"
        style={{
          background: "var(--color-cream-50, #FFFAEC)",
          borderColor: "var(--color-line, #EFE4C8)",
        }}
      >
        <div className="flex gap-2.5 items-end max-w-3xl mx-auto">
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
            className="px-4.5 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 shrink-0"
            style={{
              background: "var(--color-coral-500, #F48F68)",
              color: "var(--color-ink-900, #2A1E15)",
            }}
          >
            Send
          </button>
        </div>
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
          {showPlan && (
            <PlanPanel
              ref={planContentRef}
              markdown={planMarkdown}
              trip={trip}
              onRefine={prefillInput}
              onPatch={(msg) => void sendPatch(msg)}
              quoteHint={{ active: quoteHint, text: "Ctrl+L to quote" }}
            />
          )}
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
