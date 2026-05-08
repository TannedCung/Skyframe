import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold text-indigo-900 mb-4">Skyframe</h1>
        <p className="text-xl text-indigo-700 mb-8">
          AI-powered trip planning with live flight data. Get a personalised itinerary in minutes.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Start Planning
          </Link>
          <Link
            href="/login"
            className="border border-indigo-600 text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
