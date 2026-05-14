"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import type { UserPreferences, GdsProvider } from "@/types";

const GDS_OPTIONS: { value: GdsProvider; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto (recommended)",
    description: "Tries all configured providers in priority order",
  },
  {
    value: "kiwi",
    label: "Kiwi Tequila",
    description: "Real-time prices, global coverage",
  },
  {
    value: "vietjet",
    label: "VietJet Air",
    description: "VND prices — token service required",
  },
  { value: "airlabs", label: "AirLabs", description: "Schedule data only, no pricing" },
  {
    value: "google",
    label: "Google Flights",
    description: "Google's flight search engine — no API key",
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
        <div className="max-w-[620px] mx-auto space-y-5">
          {/* Title */}
          <Rule label={`Account · ${session?.user?.name ?? ""}`} />
          <h1
            className="mt-3 mb-7"
            style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(40px, 5vw, 56px)",
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--color-ink-900, #2A1E15)",
            }}
          >
            Settings
          </h1>

          {/* Profile card */}
          <section
            className="rounded-2xl border border-line p-6 space-y-4"
            style={{ background: "var(--color-cream-50, #FFFAEC)" }}
          >
            <h2
              className="font-semibold text-lg"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                letterSpacing: "-0.01em",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              Profile
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mono-label block mb-1">Name</span>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-ink-900, #2A1E15)" }}
                >
                  {session?.user?.name ?? "—"}
                </p>
              </div>
              <div>
                <span className="mono-label block mb-1">Email</span>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-ink-900, #2A1E15)" }}
                >
                  {session?.user?.email ?? "—"}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t" style={{ borderColor: "var(--color-line, #EFE4C8)" }}>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm font-semibold transition-colors hover:opacity-80"
                style={{ color: "#D85A45" }}
              >
                Sign out
              </button>
            </div>
          </section>

          {/* Preferences */}
          <form
            onSubmit={handleSave}
            className="rounded-2xl border border-line p-6 space-y-6"
            style={{ background: "var(--color-cream-50, #FFFAEC)" }}
          >
            <h2
              className="font-semibold text-lg"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                letterSpacing: "-0.01em",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              Preferences
            </h2>

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

            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-ink-800, #4A3A2E)" }}
                >
                  Email notifications
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-500, #968471)" }}>
                  Email me when prices change or a new itinerary is ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, notificationEmail: !p.notificationEmail }))}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                style={{
                  background: prefs.notificationEmail
                    ? "var(--color-coral-500, #F48F68)"
                    : "var(--color-cream-200, #F8EDC9)",
                }}
              >
                <span
                  className="inline-block h-5 w-5 rounded-full bg-white transition-transform shadow"
                  style={{
                    transform: prefs.notificationEmail ? "translateX(22px)" : "translateX(2px)",
                  }}
                />
              </button>
            </div>

            {/* Default currency */}
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--color-ink-800, #4A3A2E)" }}
              >
                Default currency
              </label>
              <div
                className="flex items-center justify-between px-3.5 py-2.5 rounded-[10px] border"
                style={{
                  background: "var(--color-cream-50, #FFFAEC)",
                  borderColor: "var(--color-cream-300, #EFE2B5)",
                }}
              >
                <span className="text-sm">
                  {prefs.defaultCurrency} —{" "}
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: prefs.defaultCurrency,
                  })
                    .format(0)
                    .replace(/0\.00/, "")
                    .trim()}
                </span>
                <span style={{ color: "var(--color-ink-500, #968471)" }}>▾</span>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--color-ink-800, #4A3A2E)" }}
              >
                Timezone
              </label>
              <select
                value={prefs.timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-[10px] border text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none cursor-pointer"
                style={{
                  background: "var(--color-cream-50, #FFFAEC)",
                  borderColor: "var(--color-cream-300, #EFE2B5)",
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* GDS provider */}
            <div>
              <p
                className="text-sm font-medium mb-0.5"
                style={{ color: "var(--color-ink-800, #4A3A2E)" }}
              >
                Flight data source
              </p>
              <p className="text-xs mb-3" style={{ color: "var(--color-ink-500, #968471)" }}>
                Which provider to use when searching for flights.
              </p>
              <div className="space-y-2">
                {GDS_OPTIONS.map((opt) => {
                  const active = prefs.gdsProvider === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                      style={{
                        borderColor: active
                          ? "var(--color-coral-500, #F48F68)"
                          : "var(--color-cream-300, #EFE2B5)",
                        background: active
                          ? "var(--color-coral-100, #FFE5DA)"
                          : "var(--color-cream-50, #FFFAEC)",
                      }}
                    >
                      <input
                        type="radio"
                        name="gdsProvider"
                        value={opt.value}
                        checked={active}
                        onChange={() => setPrefs((p) => ({ ...p, gdsProvider: opt.value }))}
                        style={{
                          position: "absolute",
                          width: 1,
                          height: 1,
                          padding: 0,
                          margin: -1,
                          overflow: "hidden",
                          clip: "rect(0,0,0,0)",
                          whiteSpace: "nowrap",
                          border: 0,
                        }}
                      />
                      <span
                        className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
                        style={{
                          border: `1.5px solid ${active ? "var(--color-coral-500, #F48F68)" : "var(--color-ink-400, #B6A593)"}`,
                          background: "var(--color-cream-50, #FFFAEC)",
                          position: "relative",
                        }}
                      >
                        {active && (
                          <span
                            className="absolute rounded-full"
                            style={{
                              inset: 3,
                              background: "var(--color-coral-500, #F48F68)",
                            }}
                          />
                        )}
                      </span>
                      <div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--color-ink-800, #4A3A2E)" }}
                        >
                          {opt.label}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--color-ink-500, #968471)" }}
                        >
                          {opt.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 hover:opacity-90"
              style={{
                background: "var(--color-coral-500, #F48F68)",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
