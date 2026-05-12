import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #FFF6DE 0%, #FFFAEC 100%)" }}
    >
      {/* Nav */}
      <div className="max-w-6xl mx-auto px-8 pt-6 pb-2 flex items-center justify-between">
        <Logo size={22} />
        <nav className="hidden md:flex items-center gap-7 text-sm text-ink-800">
          <a href="#" className="hover:text-ink-900 transition-colors">
            How it works
          </a>
          <a href="#" className="hover:text-ink-900 transition-colors">
            Pricing
          </a>
          <a href="#" className="hover:text-ink-900 transition-colors">
            Press
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="text-sm font-medium px-3 py-1.5 rounded-full hover:bg-cream-200 transition-colors text-ink-900"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-semibold px-4 py-1.5 rounded-full text-cream-100 hover:opacity-90 transition-opacity"
            style={{ background: "#2A1E15" }}
          >
            Get started
          </Link>
        </div>
      </div>

      {/* Editorial hero */}
      <section className="max-w-6xl mx-auto px-8 pt-10 pb-20 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <div className="flex items-center gap-3 mb-7">
            <span className="inline-block w-8 h-px bg-ink-900" />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-700">
              AI Trip Planner · Live flight prices
            </span>
          </div>
          <h1
            className="display-hero font-bold text-ink-900 mb-7"
            style={{ fontSize: "clamp(56px, 8vw, 104px)", lineHeight: 0.92 }}
          >
            Plan your next
            <br />
            <span className="text-coral-700">adventure</span> in
            <br />
            minutes.
          </h1>
          <p className="text-lg text-ink-800 max-w-md mb-8">
            Tell Skyframe where you want to go and when. We&apos;ll handle the flights, the
            day-by-day plan, and the small print.
          </p>
          <div className="flex flex-wrap gap-3 mb-10">
            <Link
              href="/dashboard"
              className="px-6 py-3.5 rounded-full font-semibold text-base bg-coral-500 text-ink-900 hover:bg-coral-600 transition-colors"
            >
              Start planning →
            </Link>
            <Link
              href="/login"
              className="px-6 py-3.5 rounded-full font-semibold text-base border border-ink-900 text-ink-900 hover:bg-cream-200 transition-colors"
            >
              See sample trip
            </Link>
          </div>
          <div className="flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-ink-500">
            <span>↳ 14k trips planned</span>
            <span className="hidden sm:inline">↳ live Kiwi flight data</span>
            <span className="hidden md:inline">↳ no card on signup</span>
          </div>
        </div>

        {/* Hero visual */}
        <div className="lg:col-span-5">
          <div className="relative">
            <div
              className="absolute -top-4 -right-3 z-10 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider"
              style={{ background: "#FFE394", color: "#8A6B1F" }}
            >
              ✦ Tokyo · sample
            </div>
            <div
              className="rounded-2xl overflow-hidden border-2 p-3"
              style={{ borderColor: "#2A1E15", background: "#FFF6DE" }}
            >
              <div
                className="rounded-lg overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: "4 / 5", background: "#8BDFDD" }}
              >
                <span className="text-ink-800 text-sm font-mono uppercase tracking-wider opacity-50">
                  Tokyo, Japan
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 px-1 pb-1 font-mono text-[10px] uppercase tracking-wider text-ink-700">
                <span>JFK → HND</span>
                <span>Mar 28 — Apr 6</span>
                <span className="text-coral-700">$1,242</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
