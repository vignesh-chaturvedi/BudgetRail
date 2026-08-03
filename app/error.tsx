"use client";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-destructive">
          Dashboard unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          BudgetRail couldn’t load this view.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your on-chain allowances are unchanged. Retry the dashboard
          connection.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
