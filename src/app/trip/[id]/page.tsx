"use client";

import { useEffect, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ItineraryView } from "@/components/ItineraryView";
import { SG1OptionList } from "@/components/SG1OptionList";
import { InvitePanel } from "@/components/InvitePanel";
import type { Trip, Itinerary, SG1Option } from "@/types";

interface TripDetailData {
  trip: Trip;
  currentItinerary: Itinerary | null;
  history: Itinerary[];
}

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<TripDetailData | null>(null);
  const [sg1Options, setSg1Options] = useState<SG1Option[]>([]);
  const [selectedSg1, setSelectedSg1] = useState<string | undefined>();
  const [loadingSg1, setLoadingSg1] = useState(false);
  const [loadingSg2, setLoadingSg2] = useState(false);
  const [loading, setLoading] = useState(true);

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
      .finally(() => setLoading(false));
  }, [status, id]);

  async function generateSG1() {
    setLoadingSg1(true);
    const res = await fetch(`/api/trips/${id}/generate-sg1`, { method: "POST" });
    const json = (await res.json()) as { options: Array<{ llm_raw_plan_json: SG1Option }> };
    setSg1Options(json.options?.map((o) => o.llm_raw_plan_json) ?? []);
    setLoadingSg1(false);
  }

  async function generateSG2(sg1OptionId: string) {
    setLoadingSg2(true);
    const res = await fetch(`/api/trips/${id}/generate-sg2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sg1OptionId }),
    });
    const json = (await res.json()) as { itinerary: Itinerary };
    setData((prev) => (prev ? { ...prev, currentItinerary: json.itinerary } : null));
    setLoadingSg2(false);
  }

  if (loading || status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  if (!data) return <div className="p-8 text-red-500">Trip not found</div>;

  const { trip, currentItinerary } = data;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{trip.title}</h1>
          <p className="text-gray-500 mt-1">
            {trip.originAirport} → {trip.destinationCity ?? trip.destinationCountry ?? "Flexible"} |{" "}
            {new Date(trip.startDate).toLocaleDateString()} –{" "}
            {new Date(trip.endDate).toLocaleDateString()}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: SG1 options */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Trip Options</h2>
                <button
                  onClick={generateSG1}
                  disabled={loadingSg1}
                  className="text-sm text-indigo-600 font-medium disabled:opacity-50 hover:text-indigo-700"
                >
                  {loadingSg1 ? "Generating..." : "Regenerate"}
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
                  className="w-full mt-4 bg-indigo-600 text-white py-2 rounded-lg font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {loadingSg2 ? "Building Itinerary..." : "Build Full Itinerary →"}
                </button>
              )}
            </div>

            <InvitePanel tripId={id} />
          </div>

          {/* Right column: Itinerary */}
          <div className="lg:col-span-2">
            {currentItinerary ? (
              <ItineraryView itinerary={currentItinerary} />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
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
  );
}
