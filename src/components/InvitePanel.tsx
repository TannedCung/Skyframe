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
    <div data-testid="invite-panel" className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Invite Friends</h3>
      <p className="text-sm text-gray-500 mb-3">
        Share this trip and let friends watch for price changes.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="friend@example.com, another@example.com"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          data-testid="invite-email-input"
        />
        <button
          onClick={handleInvite}
          disabled={loading || !emails.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
          data-testid="invite-submit"
        >
          {loading ? "Sending..." : "Invite"}
        </button>
      </div>

      {result && (
        <div className="mt-3 text-sm" data-testid="invite-result">
          {result.invited.length > 0 && (
            <p className="text-green-600">Invited: {result.invited.join(", ")}</p>
          )}
          {result.failed.length > 0 && (
            <p className="text-red-500">Failed: {result.failed.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
