"use client";

import { useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ItineraryView } from "@/components/ItineraryView";
import { SG1OptionList } from "@/components/SG1OptionList";
import { InvitePanel } from "@/components/InvitePanel";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { Trip, Itinerary, SG1Option } from "@/types";

interface TripDetailData {
  trip: Trip;
  currentItinerary: Itinerary | null;
  history: Itinerary[];
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
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3 text-green-800 text-sm font-medium">
        You&#39;re now watching this trip. Updates will be emailed to you.
      </div>
    );
  }

  return (
    <div className="bg-coral-100 border border-coral-300 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
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
  const [sg1Options, setSg1Options] = useState<SG1Option[]>([]);
  const [selectedSg1, setSelectedSg1] = useState<string | undefined>();
  const [loadingSg1, setLoadingSg1] = useState(false);
  const [loadingSg2, setLoadingSg2] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(searchParams.get("invite_token"));

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch(`/api/trips/${id}`).then((r) => r.json() as Promise<TripDetailData>),
      fetch(`/api/trips/${id}/generate-sg1`).then(
        (r) => r.json() as Promise<{ options: Array<{ llm_raw_plan_json: SG1Option }> }>,
      ),
    ])
      .then(([tripData, sg1Data]) => {
        setData(tripData);
        setSg1Options(sg1Data.options?.map((o) => o.llm_raw_plan_json) ?? []);
      })
      .catch(() => setFetchError("Failed to load trip. Please refresh."))
      .finally(() => setLoading(false));
  }, [status, id]);

  async function generateSG1() {
    setLoadingSg1(true);
    try {
      const res = await fetch(`/api/trips/${id}/generate-sg1`, { method: "POST" });
      const json = (await res.json()) as { options: Array<{ llm_raw_plan_json: SG1Option }> };
      setSg1Options(json.options?.map((o) => o.llm_raw_plan_json) ?? []);
    } finally {
      setLoadingSg1(false);
    }
  }

  async function generateSG2(sg1OptionId: string) {
    setLoadingSg2(true);
    try {
      const res = await fetch(`/api/trips/${id}/generate-sg2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sg1OptionId }),
      });
      const json = (await res.json()) as { itinerary: Itinerary };
      setData((prev) => (prev ? { ...prev, currentItinerary: json.itinerary } : null));
    } finally {
      setLoadingSg2(false);
    }
  }

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

  const { trip, currentItinerary } = data;
  const destination = trip.destinationCity ?? trip.destinationCountry ?? "Adventure";
  const durationDays = Math.ceil(
    (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <>
      <AppHeader crumbs={[{ label: "My Trips", href: "/dashboard" }, { label: trip.title }]} />
      <main className="min-h-screen bg-cream-100">
        {/* Editorial trip hero */}
        <div className="max-w-5xl mx-auto px-8 pt-8">
          <div
            className="rounded-2xl overflow-hidden border-2"
            style={{ borderColor: "#2A1E15", background: "#FFF6DE" }}
          >
            <div className="grid md:grid-cols-5 gap-0">
              <div
                className="md:col-span-2 relative flex items-center justify-center"
                style={{ minHeight: 240, background: "#8BDFDD" }}
              >
                <span className="text-ink-800 text-sm font-mono uppercase tracking-wider opacity-40">
                  {destination}
                </span>
              </div>
              <div
                className="md:col-span-3 p-7 flex flex-col justify-between"
                style={{ background: "#FFF6DE" }}
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <StatusBadge status={trip.status} />
                    <span
                      className="text-[11px] font-mono uppercase tracking-[0.18em]"
                      style={{ color: "#6B5A4D" }}
                    >
                      {trip.originAirport} → {destination}
                    </span>
                  </div>
                  <h1
                    className="display-tight font-bold mb-3"
                    style={{
                      fontSize: "clamp(28px, 4vw, 44px)",
                      lineHeight: 1.05,
                      color: "#2A1E15",
                    }}
                  >
                    {trip.title}
                  </h1>
                  <p className="text-base text-ink-800">
                    {new Date(trip.startDate).toLocaleDateString()} –{" "}
                    {new Date(trip.endDate).toLocaleDateString()}
                    {trip.flexibilityDays > 0 && (
                      <span className="text-ink-500"> · ±{trip.flexibilityDays} days flex</span>
                    )}
                  </p>
                </div>
                <div
                  className="flex flex-wrap gap-2 mt-5 pt-5 border-t"
                  style={{ borderColor: "#EFE4C8" }}
                >
                  <span
                    className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: "#F8EDC9", color: "#6B5A4D" }}
                  >
                    {durationDays} days
                  </span>
                  <span
                    className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: "#E5F8F7", color: "#1F6E6B" }}
                  >
                    {trip.tripType === "round_trip" ? "Round trip" : "One way"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-8 pt-6">
          {inviteToken && <InviteBanner tripId={id} token={inviteToken} onDone={dismissInvite} />}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: SG1 + Invite */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-xl border border-line p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="display-h2 font-semibold text-ink-900 text-lg">Trip Options</h2>
                  <button
                    onClick={generateSG1}
                    disabled={loadingSg1}
                    className="text-sm text-coral-700 font-medium disabled:opacity-50 hover:text-coral-600 transition-colors"
                  >
                    {loadingSg1 ? "Generating…" : "Regenerate"}
                  </button>
                </div>
                <SG1OptionList
                  options={sg1Options}
                  onSelect={setSelectedSg1}
                  selectedId={selectedSg1}
                  loading={loadingSg1}
                />
                {selectedSg1 && (
                  <button
                    onClick={() => generateSG2(selectedSg1)}
                    disabled={loadingSg2}
                    className="w-full mt-4 bg-coral-500 text-ink-900 py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-coral-600 transition-colors"
                  >
                    {loadingSg2 ? "Building Itinerary…" : "Build Full Itinerary →"}
                  </button>
                )}
              </div>
              <InvitePanel tripId={id} />
            </div>

            {/* Right: Itinerary */}
            <div className="lg:col-span-2">
              {currentItinerary ? (
                <ItineraryView itinerary={currentItinerary} />
              ) : (
                <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-400">
                  <p className="text-lg mb-2">No itinerary yet</p>
                  <p className="text-sm">
                    Select a trip option and click &quot;Build Full Itinerary&quot;
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
