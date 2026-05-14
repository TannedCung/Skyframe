"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TripCard } from "@/components/TripCard";
import { AppHeader } from "@/components/AppHeader";
import type { Trip } from "@/types";

function TripCardSkeleton() {
  return (
    <div className="rounded-[18px] border border-line overflow-hidden animate-pulse bg-cream-50">
      <div className="h-24 bg-cream-200" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-cream-200 rounded w-2/3" />
        <div className="h-3 bg-cream-200 rounded w-1/2" />
      </div>
    </div>
  );
}

function Rule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-block w-8 h-px bg-ink-900" />
      <span className="mono-label" style={{ color: "#6B5A4D" }}>
        {label}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/trips")
      .then((r) => r.json())
      .then((data: { trips: Trip[] }) => setTrips(data.trips ?? []))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading") {
    return (
      <>
        <AppHeader crumbs={[{ label: "My Trips" }]} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const watchingCount = trips.filter((t) => t.status === "archived").length;

  return (
    <>
      <AppHeader crumbs={[{ label: "My Trips" }]} />
      <main className="min-h-screen bg-cream-100 p-8">
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="flex items-end justify-between mb-9">
            <div>
              <Rule label="Spring · Issue №14" />
              <h1
                className="mt-3.5 mb-1"
                style={{
                  fontFamily: "'Newsreader', Georgia, serif",
                  fontWeight: 500,
                  fontSize: "clamp(40px, 5vw, 56px)",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: "var(--color-ink-900, #2A1E15)",
                }}
              >
                My trips
              </h1>
              {session?.user?.name && (
                <p className="text-ink-500 text-sm" style={{ margin: 0 }}>
                  Welcome back, {session.user.name}
                  {watchingCount > 0 &&
                    ` — ${watchingCount} trip${watchingCount > 1 ? "s" : ""} ${watchingCount === 1 ? "is" : "are"} watching prices.`}
                </p>
              )}
            </div>
            <button
              onClick={() => router.push("/trip/new")}
              className="px-5 py-3 rounded-xl font-semibold text-sm transition-colors hover:opacity-90"
              style={{
                background: "var(--color-coral-500, #F48F68)",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              ＋ New trip
            </button>
          </div>

          {fetchError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              Failed to load trips. Please refresh the page.
            </div>
          )}

          {loading ? (
            <div className="grid gap-4.5 md:grid-cols-2">
              <TripCardSkeleton />
              <TripCardSkeleton />
              <TripCardSkeleton />
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-20 text-ink-400">
              <p className="text-xl mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
                No trips yet
              </p>
              <p className="text-sm mb-6">Create your first AI-powered trip plan!</p>
              <button
                onClick={() => router.push("/trip/new")}
                className="px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors hover:opacity-90"
                style={{
                  background: "var(--color-coral-500, #F48F68)",
                  color: "var(--color-ink-900, #2A1E15)",
                }}
              >
                Plan a trip
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-[18px] md:grid-cols-2">
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>

              {/* Archive */}
              <div
                className="mt-10 p-5 px-6 rounded-[14px] flex items-center justify-between"
                style={{ border: "1px dashed var(--color-line, #EFE4C8)" }}
              >
                <div>
                  <span className="mono-label">Archive · {trips.length} past trips</span>
                  <div
                    className="mt-1"
                    style={{
                      fontFamily: "'Newsreader', serif",
                      fontSize: 18,
                      fontStyle: "italic",
                      color: "var(--color-ink-800, #4A3A2E)",
                    }}
                  >
                    {trips
                      .map((t) => t.destinationCity ?? "Flexible")
                      .slice(0, 5)
                      .join(", ")}
                    …
                  </div>
                </div>
                <span
                  className="text-sm underline cursor-pointer hover:text-ink-900 transition-colors"
                  style={{ color: "var(--color-ink-700, #6B5A4D)", textUnderlineOffset: 4 }}
                >
                  Open archive →
                </span>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
