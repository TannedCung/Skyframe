"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TripCard } from "@/components/TripCard";
import { AppHeader } from "@/components/AppHeader";
import type { Trip } from "@/types";

function TripCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-line p-5 animate-pulse space-y-3">
      <div className="h-4 bg-cream-200 rounded w-2/3" />
      <div className="h-3 bg-cream-200 rounded w-1/2" />
      <div className="h-3 bg-cream-200 rounded w-1/3" />
    </div>
  );
}

export default function DashboardPage() {
  const { status } = useSession();
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
        <AppHeader />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-cream-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-ink-900">My Trips</h1>
            <button
              onClick={() => router.push("/trip/new")}
              className="bg-coral-500 text-ink-900 px-5 py-2 rounded-lg font-semibold hover:bg-coral-600 transition-colors"
            >
              + New Trip
            </button>
          </div>

          {fetchError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              Failed to load trips. Please refresh the page.
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <TripCardSkeleton />
              <TripCardSkeleton />
              <TripCardSkeleton />
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-20 text-ink-400">
              <p className="text-xl mb-4">No trips yet</p>
              <p className="text-sm mb-6">Create your first AI-powered trip plan!</p>
              <button
                onClick={() => router.push("/trip/new")}
                className="bg-coral-500 text-ink-900 px-6 py-2.5 rounded-lg font-semibold hover:bg-coral-600 transition-colors"
              >
                Plan a trip
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
