"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-surface p-8 text-center">
      <h2 className="text-xl font-semibold text-text">Something went wrong</h2>
      <p className="text-sm text-text-muted">{error.message || "Unexpected error"}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
