"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-cream-100">
      <div className="text-center max-w-md px-6">
        <h2 className="text-2xl font-bold text-ink-900 mb-2">Something went wrong</h2>
        <p className="text-ink-500 mb-6 text-sm">
          {error.message ?? "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="bg-coral-500 text-ink-900 px-5 py-2 rounded-lg font-semibold hover:bg-coral-600 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
