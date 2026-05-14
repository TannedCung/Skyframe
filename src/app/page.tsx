import Link from "next/link";
import { Logo } from "@/components/Logo";

const HERO_IMG =
  "https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=1600&q=80&auto=format&fit=crop";

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

export default function Home() {
  return (
    <main
      className="min-h-screen"
      style={{
        background: "var(--color-cream-100, #FFF6DE)",
        color: "var(--color-ink-900, #2A1E15)",
        fontFamily: "'Geist', sans-serif",
      }}
    >
      {/* Nav */}
      <div className="max-w-[1280px] mx-auto px-10 pt-6 pb-2 flex items-center justify-between">
        <Logo size={22} />
        <nav
          className="hidden md:flex items-center gap-8 text-sm"
          style={{ color: "var(--color-ink-800, #4A3A2E)" }}
        >
          <a href="#how-it-works" className="hover:text-ink-900 transition-colors">
            How it works
          </a>
          <a href="#sample-trip" className="hover:text-ink-900 transition-colors">
            Sample trip
          </a>
          <a href="#pricing" className="hover:text-ink-900 transition-colors">
            Pricing
          </a>
          <a href="#press" className="hover:text-ink-900 transition-colors">
            Press
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="text-sm font-medium px-3.5 py-2 rounded-full hover:bg-cream-200 transition-colors"
            style={{ color: "var(--color-ink-900, #2A1E15)" }}
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90"
            style={{
              background: "var(--color-ink-900, #2A1E15)",
              color: "var(--color-cream-100, #FFF6DE)",
            }}
          >
            Get started
          </Link>
        </div>
      </div>

      {/* Hero — two-column editorial layout */}
      <section className="max-w-[1280px] mx-auto px-10 pt-11 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-14 items-end">
        {/* LEFT */}
        <div>
          <div className="mb-7">
            <Rule label="Issue №14 · Plan now · Pay never" />
          </div>
          <h1
            style={{
              fontFamily: "'Newsreader', 'Source Serif 4', Georgia, serif",
              fontSize: "clamp(56px, 8vw, 110px)",
              lineHeight: 0.94,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              color: "var(--color-ink-900, #2A1E15)",
            }}
          >
            The whole trip,
            <br />
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--color-coral-700, #B85633)",
              }}
            >
              almost
            </em>{" "}
            before
            <br />
            you ask.
          </h1>
          <p
            className="mt-7 max-w-[460px]"
            style={{ fontSize: 18, lineHeight: 1.55, color: "var(--color-ink-700, #6B5A4D)" }}
          >
            Skyframe is a quiet writing room for trips. Tell it where you&apos;d like to be — it
            sketches the route, watches the flights, and revises the days when prices move.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 items-center">
            <Link
              href="/dashboard"
              className="px-6 py-3.5 rounded-full font-semibold text-base transition-colors hover:opacity-90"
              style={{
                background: "var(--color-coral-500, #F48F68)",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              Start planning →
            </Link>
            <Link
              href="/trip/new"
              className="px-6 py-3.5 rounded-full font-medium text-base transition-colors hover:bg-cream-200"
              style={{
                border: "1px solid var(--color-ink-900, #2A1E15)",
                color: "var(--color-ink-900, #2A1E15)",
              }}
            >
              See a sample trip
            </Link>
          </div>
          <div className="mt-9 flex gap-7" style={{ color: "var(--color-ink-500, #968471)" }}>
            <span className="mono-label">↳ 14,200 trips drafted</span>
            <span className="mono-label hidden sm:inline">↳ Live Kiwi prices</span>
            <span className="mono-label hidden md:inline">↳ No card on signup</span>
          </div>
        </div>

        {/* RIGHT — Hero photo editorial card */}
        <div className="relative">
          <div
            className="absolute -top-4 -right-2.5 z-10 px-3.5 py-2 rounded-full mono-label"
            style={{
              background: "var(--color-yellow-300, #FFE394)",
              color: "var(--color-ink-900, #2A1E15)",
              transform: "rotate(3deg)",
              fontSize: "10.5px",
            }}
          >
            ✦ Tokyo · Sample issue
          </div>
          <div
            className="border-2 p-3 rounded-sm"
            style={{
              borderColor: "var(--color-ink-900, #2A1E15)",
              background: "var(--color-cream-50, #FFFAEC)",
              boxShadow: "0 24px 60px rgba(60,40,20,.18)",
            }}
          >
            <div className="relative overflow-hidden rounded" style={{ aspectRatio: "3 / 4" }}>
              <img
                src={HERO_IMG}
                alt="Mt Fuji at dawn"
                loading="eager"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  background: "linear-gradient(160deg,#8BDFDD,#F48F68)",
                  borderRadius: 2,
                }}
              />
            </div>
            <div className="mt-3.5 flex items-baseline justify-between px-1">
              <div>
                <div
                  style={{
                    fontFamily: "'Newsreader', serif",
                    fontSize: 22,
                    lineHeight: 1.1,
                    fontStyle: "italic",
                    color: "var(--color-ink-900, #2A1E15)",
                  }}
                >
                  Tokyo & Kyoto
                </div>
                <span className="mono-label">9 nights · Mar 28 — Apr 6</span>
              </div>
              <div className="text-right">
                <span className="mono-label" style={{ color: "var(--color-ink-900, #2A1E15)" }}>
                  JFK → HND
                </span>
                <div
                  className="mt-0.5 font-semibold"
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 18,
                    color: "var(--color-coral-700, #B85633)",
                  }}
                >
                  $1,242
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three-up "how it works" — editorial column rule */}
      <section id="how-it-works" className="max-w-[1280px] mx-auto px-10 pb-18">
        <div className="border-t" style={{ borderColor: "var(--color-ink-900, #2A1E15)" }}>
          <div className="grid md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Describe the trip",
                b: 'A line is enough — "ten days in Japan in late March, two of us, like food and trains." Skyframe sketches three options to choose from.',
              },
              {
                n: "02",
                t: "Pick a sketch",
                b: "Each option has a vibe, a rough route, and a flight band. Press one — it becomes the working draft.",
              },
              {
                n: "03",
                t: "Days fill in",
                b: "Real flights from Kiwi, day-by-day plan you can edit in plain English. When the price moves, the draft updates and emails you.",
              },
            ].map((c, i) => (
              <div
                key={i}
                className="pt-7 pb-7 px-6"
                style={{
                  borderRight: i < 2 ? "1px solid var(--color-line, #EFE4C8)" : "none",
                }}
              >
                <span className="mono-label" style={{ color: "var(--color-coral-700, #B85633)" }}>
                  {c.n}
                </span>
                <h3
                  className="mt-2.5 mb-2.5"
                  style={{
                    fontFamily: "'Newsreader', serif",
                    fontSize: 26,
                    lineHeight: 1.15,
                    fontWeight: 500,
                    color: "var(--color-ink-900, #2A1E15)",
                  }}
                >
                  {c.t}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-ink-700, #6B5A4D)", margin: 0 }}
                >
                  {c.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
