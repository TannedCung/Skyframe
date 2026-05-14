"use client";

import { useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TripChatUI } from "@/components/TripChatUI";
import type { ChatMessage } from "@/lib/agent/trip-planner";
import type { Trip } from "@/types";

interface TripDetailData {
  trip: Trip;
  messages: ChatMessage[];
  draftPlan: string | null;
}

function InviteBanner({
  tripId,
  token,
  onDone,
}: {
  tripId: string;
  token: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<"idle" | "accepting" | "done" | "error">("idle");

  async function accept() {
    setState("accepting");
    try {
      const res = await fetch(`/api/trips/${tripId}/invite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token }),
      });
      setState(res.ok ? "done" : "error");
      if (res.ok) setTimeout(onDone, 2000);
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mx-8 mt-4 flex items-center gap-3 text-green-800 text-sm font-medium">
        You&#39;re now watching this trip. Updates will be emailed to you.
      </div>
    );
  }

  return (
    <div className="bg-coral-100 border border-coral-300 rounded-xl p-4 mx-8 mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-coral-700">
        You&#39;ve been invited to view this trip. Accept to receive price-change updates.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {state === "error" && <span className="text-xs text-red-500">Failed — try again</span>}
        <button
          onClick={accept}
          disabled={state === "accepting"}
          className="bg-coral-500 text-ink-900 text-sm px-4 py-1.5 rounded-lg font-semibold hover:bg-coral-600 transition-colors disabled:opacity-50"
        >
          {state === "accepting" ? "Accepting…" : "Accept invite"}
        </button>
        <button
          onClick={onDone}
          className="text-sm text-coral-600 hover:text-coral-700 font-medium"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<TripDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(searchParams.get("invite_token"));

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/trips/${id}`)
      .then((r) => r.json() as Promise<TripDetailData>)
      .then((tripData) => setData(tripData))
      .catch(() => setFetchError("Failed to load trip. Please refresh."))
      .finally(() => setLoading(false));
  }, [status, id]);

  function dismissInvite() {
    setInviteToken(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("invite_token");
    window.history.replaceState({}, "", url.toString());
  }

  const crumbs = [
    { label: "My Trips", href: "/dashboard" },
    { label: loading ? "…" : (data?.trip.title ?? "Trip") },
  ];

  if (loading || status === "loading") {
    return (
      <>
        <AppHeader crumbs={crumbs} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (fetchError || !data) {
    return (
      <>
        <AppHeader crumbs={crumbs} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="text-center">
            <p className="text-ink-500 mb-4">{fetchError ?? "Trip not found"}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-coral-600 font-medium hover:text-coral-700"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader crumbs={crumbs} />
      <main className="bg-cream-100 flex flex-col h-[calc(100vh-57px)]">
        {inviteToken && <InviteBanner tripId={id} token={inviteToken} onDone={dismissInvite} />}
        <div className="flex-1 min-h-0">
          <TripChatUI
            initialTripId={data.trip.id}
            initialMessages={data.messages}
            initialPlanMarkdown={data.draftPlan}
            trip={data.trip}
          />
        </div>
      </main>
    </>
  );
}
