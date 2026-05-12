"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  return (
    <main className="min-h-screen grid lg:grid-cols-2" style={{ background: "#FFF6DE" }}>
      {/* Left: brand editorial panel */}
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ background: "linear-gradient(160deg, #8BDFDD 0%, #FFE394 70%, #F48F68 130%)" }}
      >
        <Logo size={22} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-block w-8 h-px bg-ink-900" />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-900">
              This week
            </span>
          </div>
          <h2
            className="display-tight font-bold mb-6"
            style={{
              fontSize: "clamp(40px, 5vw, 64px)",
              lineHeight: 0.95,
              color: "#2A1E15",
              letterSpacing: "-0.025em",
            }}
          >
            Tokyo cherry
            <br />
            blossoms,
            <br />
            $1,242 round-trip.
          </h2>
          <p className="max-w-sm text-base mb-8" style={{ color: "#2A1E15", opacity: 0.78 }}>
            Skyframe watched 9,140 fares this week and found six trips for less than the cost of
            staying home.
          </p>
          <div className="flex flex-wrap gap-2 max-w-sm">
            {["Lisbon · $389", "Reykjavík · $612", "CDMX · $284", "Marrakech · $701"].map((t) => (
              <span
                key={t}
                className="text-[11px] font-mono px-2.5 py-1 rounded-full"
                style={{ background: "rgba(42, 30, 21, 0.08)", color: "#2A1E15" }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider"
          style={{ color: "#2A1E15", opacity: 0.7 }}
        >
          <span>v3 · live prices</span>
          <span>↳ kiwi data</span>
        </div>

        {/* Decorative radial */}
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, #F48F68 0%, transparent 60%)" }}
        />
      </aside>

      {/* Right: auth card */}
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6 flex justify-center">
            <Logo size={26} />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="inline-block w-6 h-px bg-ink-900" />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-500">
              Sign in
            </span>
          </div>

          <h1
            className="display-tight font-bold text-ink-900 mb-3"
            style={{ fontSize: "clamp(32px, 4vw, 44px)", lineHeight: 1 }}
          >
            Welcome back.
          </h1>
          <p className="mb-8 text-base text-ink-700">
            Pick up where you left off — your draft trips and price alerts are waiting.
          </p>

          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full flex items-center justify-center gap-3 border border-cream-300 rounded-lg px-6 py-3 text-ink-800 font-semibold hover:bg-cream-200 transition-colors bg-white"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px" style={{ background: "#EFE4C8" }} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">or</span>
            <span className="flex-1 h-px" style={{ background: "#EFE4C8" }} />
          </div>

          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full text-sm font-medium rounded-lg px-4 py-2.5 transition-colors hover:bg-cream-200 text-ink-900"
          >
            Use a magic link instead →
          </button>

          <p className="mt-10 text-xs leading-relaxed text-ink-400">
            By continuing you agree to Skyframe&apos;s{" "}
            <a href="#" className="underline text-ink-500">
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="underline text-ink-500">
              Privacy notice
            </a>
            . We don&apos;t store payment info.
          </p>
        </div>
      </section>
    </main>
  );
}
