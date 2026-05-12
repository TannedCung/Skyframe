"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { UserPreferences } from "@/types";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "VND", "THB"];
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
