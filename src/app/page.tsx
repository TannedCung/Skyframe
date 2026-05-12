import Link from "next/link";

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: "linear-gradient(135deg, #FFF6DE 0%, #FFE394 50%, #8BDFDD 100%)" }}
    >
      <div className="max-w-2xl text-center">
        <h1
          className="text-5xl font-bold text-coral-700 mb-4"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Skyframe
        </h1>
        <p className="text-xl text-coral-600 mb-8">
          AI-powered trip planning with live flight data. Get a personalised itinerary in minutes.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="bg-coral-500 text-ink-900 px-6 py-3 rounded-lg font-semibold hover:bg-coral-600 transition-colors"
          >
            Start Planning
          </Link>
          <Link
            href="/login"
            className="border border-coral-500 text-coral-600 px-6 py-3 rounded-lg font-semibold hover:bg-coral-100 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
