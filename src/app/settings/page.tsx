"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { UserPreferences, GdsProvider } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "VND", "THB"];

const GDS_OPTIONS: { value: GdsProvider; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto (recommended)",
    description: "Tries all configured providers in priority order",
  },
  {
    value: "kiwi",
    label: "Kiwi Tequila",
    description: "Real-time prices with global route coverage",
  },
  {
    value: "vietjet",
    label: "VietJet Air",
    description: "VND prices — requires the token service to be running",
  },
  { value: "airlabs", label: "AirLabs", description: "Schedule data only, no pricing" },
  {
    value: "google",
    label: "Google Flights",
    description: "Google's flight search engine — no API key needed",
  },
];
const TIMEZONES = [
  "UTC",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Seoul",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [prefs, setPrefs] = useState<UserPreferences>({
    notificationEmail: true,
    defaultCurrency: "USD",
    timezone: "UTC",
    gdsProvider: "auto",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserPreferences) => setPrefs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const crumbs = [{ label: "My Trips", href: "/dashboard" }, { label: "Settings" }];

  if (status === "loading" || loading) {
    return (
      <>
        <AppHeader crumbs={crumbs} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader crumbs={crumbs} />
      <main className="min-h-screen bg-cream-100 p-8">
        <div className="max-w-xl mx-auto space-y-6">
          <h1 className="display-tight text-4xl font-bold text-ink-900">Settings</h1>

          {/* Profile card */}
          <div className="bg-white rounded-xl border border-line p-6 space-y-4">
            <h2 className="display-h2 font-semibold text-ink-900">Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-ink-500 mb-1">Name</p>
                <p className="font-medium text-ink-900 text-sm">{session?.user?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Email</p>
                <p className="font-medium text-ink-900 text-sm">{session?.user?.email ?? "—"}</p>
              </div>
            </div>
            <div className="pt-4 border-t border-line">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="font-semibold transition-colors"
                style={{ color: "#D85A45" }}
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Preferences form */}
          <form
            onSubmit={handleSave}
            className="bg-white rounded-xl border border-line p-6 space-y-5"
          >
            <h2 className="display-h2 font-semibold text-ink-900">Preferences</h2>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {saved && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                Preferences saved.
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-700">Email notifications</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  Receive emails when flight prices change or a new itinerary is ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, notificationEmail: !p.notificationEmail }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 ${
                  prefs.notificationEmail ? "bg-coral-500" : "bg-cream-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    prefs.notificationEmail ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div>
              <label
                htmlFor="defaultCurrency"
                className="block text-sm font-medium text-ink-700 mb-1"
              >
                Default currency
              </label>
              <select
                id="defaultCurrency"
                value={prefs.defaultCurrency}
                onChange={(e) => setPrefs((p) => ({ ...p, defaultCurrency: e.target.value }))}
                className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-ink-700 mb-1">
                Timezone
              </label>
              <select
                id="timezone"
                value={prefs.timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full border border-cream-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* GDS provider selection */}
            <div>
              <p className="text-sm font-medium text-ink-700 mb-2">Flight Data Source</p>
              <p className="text-xs text-ink-500 mb-3">
                Choose which provider to use when searching for flights
              </p>
              <div className="space-y-2">
                {GDS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      prefs.gdsProvider === opt.value
                        ? "border-coral-500 bg-coral-50"
                        : "border-cream-300 hover:border-cream-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gdsProvider"
                      value={opt.value}
                      checked={prefs.gdsProvider === opt.value}
                      onChange={() => setPrefs((p) => ({ ...p, gdsProvider: opt.value }))}
                      className="mt-0.5 accent-coral-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink-800">{opt.label}</p>
                      <p className="text-xs text-ink-500 mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-coral-500 text-ink-900 py-2.5 rounded-lg font-semibold hover:bg-coral-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
