"use client";

import { useState } from "react";

interface InvitePanelProps {
  tripId: string;
}

export function InvitePanel({ tripId }: InvitePanelProps) {
  const [emails, setEmails] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invited: string[]; failed: string[] } | null>(null);

  async function handleInvite() {
    const emailList = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (!emailList.length) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailList }),
      });
      const data = (await res.json()) as { invited: { email: string }[]; failed: string[] };
      setResult({
        invited: data.invited.map((i) => i.email),
        failed: data.failed ?? [],
      });
      setEmails("");
    } catch {
      setResult({ invited: [], failed: emailList });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid="invite-panel"
      className="rounded-[14px] border border-line p-5"
      style={{ background: "var(--color-cream-50, #FFFAEC)" }}
    >
      <h3
        className="font-semibold mb-1"
        style={{
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: "18px",
          letterSpacing: "-0.01em",
          color: "var(--color-ink-900, #2A1E15)",
        }}
      >
        Invite a traveler
      </h3>
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-500, #968471)" }}>
        Share this trip and let friends watch for price changes.
      </p>

      <div className="flex gap-2.5">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="friend@example.com"
          className="flex-1 rounded-[10px] px-3.5 py-2.5 text-sm focus:outline-none"
          data-testid="invite-email-input"
          style={{
            border: "1px solid var(--color-cream-300, #EFE2B5)",
            background: "var(--color-cream-50, #FFFAEC)",
          }}
        />
        <button
          onClick={handleInvite}
          disabled={loading || !emails.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 hover:opacity-90"
          data-testid="invite-submit"
          style={{
            background: "var(--color-coral-500, #F48F68)",
            color: "var(--color-ink-900, #2A1E15)",
          }}
        >
          {loading ? "Sending..." : "Invite"}
        </button>
      </div>

      {result && (
        <div className="mt-3 text-sm" data-testid="invite-result">
          {result.invited.length > 0 && (
            <p className="text-teal-600">Invited: {result.invited.join(", ")}</p>
          )}
          {result.failed.length > 0 && (
            <p className="text-red-500">Failed: {result.failed.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
