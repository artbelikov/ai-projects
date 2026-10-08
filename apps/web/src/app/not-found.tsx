"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-surface p-8 text-center">
      <h2 className="text-xl font-semibold text-text">Page not found</h2>
      <p className="text-sm text-text-muted">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/"
        className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        Back home
      </Link>
    </div>
  );
}
