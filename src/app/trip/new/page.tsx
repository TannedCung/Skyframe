"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/AppHeader";

export default function NewTripPage() {
  const { status } = useSession({ required: true });
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    originAirport: "",
    destinationCity: "",
    destinationCountry: "",
    startDate: "",
    endDate: "",
    flexibilityDays: 0,
    preferenceCheapest: true,
    preferenceFlightTime: "any" as "any" | "day" | "night",
    tripType: "round_trip" as "round_trip" | "one_way",
  });

  const crumbs = [{ label: "My Trips", href: "/dashboard" }, { label: "Plan a New Trip" }];

  if (status === "loading") {
    return (
      <>
        <AppHeader crumbs={crumbs} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { trip?: { id: string }; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create trip");
        return;
      }
      router.push(`/trip/${data.trip!.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader crumbs={crumbs} />
      <main className="min-h-screen bg-cream-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-line p-8">
            <h1 className="display-tight text-2xl font-bold text-ink-900 mb-6">Plan a New Trip</h1>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-ink-700 mb-1">
                  Trip Title
                </label>
                <input
                  id="title"
                  required
                  type="text"
                  placeholder="e.g. Tokyo Adventure"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="originAirport"
                    className="block text-sm font-medium text-ink-700 mb-1"
                  >
                    Origin Airport (IATA)
                  </label>
                  <input
                    id="originAirport"
                    required
                    type="text"
                    placeholder="e.g. HAN"
                    maxLength={3}
                    value={form.originAirport}
                    onChange={(e) => set("originAirport", e.target.value.toUpperCase())}
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="destinationCity"
                    className="block text-sm font-medium text-ink-700 mb-1"
                  >
                    Destination City
                  </label>
                  <input
                    id="destinationCity"
                    type="text"
                    placeholder="e.g. Tokyo"
                    value={form.destinationCity}
                    onChange={(e) => set("destinationCity", e.target.value)}
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-ink-700 mb-1"
                  >
                    Start Date
                  </label>
                  <input
                    id="startDate"
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-ink-700 mb-1">
                    End Date
                  </label>
                  <input
                    id="endDate"
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tripType" className="block text-sm font-medium text-ink-700 mb-1">
                    Flight Type
                  </label>
                  <select
                    id="tripType"
                    value={form.tripType}
                    onChange={(e) => set("tripType", e.target.value as typeof form.tripType)}
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="round_trip">Round Trip</option>
                    <option value="one_way">One Way</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="preferenceFlightTime"
                    className="block text-sm font-medium text-ink-700 mb-1"
                  >
                    Preferred Flight Time
                  </label>
                  <select
                    id="preferenceFlightTime"
                    value={form.preferenceFlightTime}
                    onChange={(e) =>
                      set(
                        "preferenceFlightTime",
                        e.target.value as typeof form.preferenceFlightTime,
                      )
                    }
                    className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="any">Any time</option>
                    <option value="day">Day flights</option>
                    <option value="night">Night flights</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="cheapest"
                  type="checkbox"
                  checked={form.preferenceCheapest}
                  onChange={(e) => set("preferenceCheapest", e.target.checked)}
                  className="h-4 w-4 text-coral-500 rounded border-cream-300"
                />
                <label htmlFor="cheapest" className="text-sm text-ink-700">
                  Prefer cheapest available flights
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-coral-500 text-ink-900 py-3 rounded-lg font-semibold hover:bg-coral-600 transition-colors disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Trip & Plan with AI →"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
