"use client";

import { useState } from "react";
import { postJson, ApiError } from "../../../lib/api";

interface DelegationStep {
  from: string;
  to: string;
  task: string;
  result: string;
  error?: string;
}

interface SupervisorResponse {
  status: "success" | "error";
  result: string;
  delegationChain: DelegationStep[];
  tokenUsage: number;
  error?: string;
}

const examples = [
  "Analyze Q3 sales data and draft an email summary",
  "Research vector databases and write a comparison",
  "Calculate total budget including 20% tax and format as a report",
];

const workers = [
  { name: "Analyst", skills: "Math, Data, Calculations" },
  { name: "Researcher", skills: "Search, Facts, Documents" },
  { name: "Writer", skills: "Summaries, Communication" },
];

export default function SupervisorPage() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState<SupervisorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postJson<SupervisorResponse>("/agents/supervisor", {
        task,
      });
      setResult(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">Multi-Agent Supervisor</h1>
      <p className="text-sm text-text-muted">
        A supervisor analyzes tasks and delegates to specialized workers:
        Analyst (math/data), Researcher (search/docs), and Writer
        (summaries/communication).
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {workers.map((w) => (
          <div
            key={w.name}
            className="rounded-lg border border-border bg-surface p-3 text-center"
          >
            <div className="font-semibold text-primary">{w.name}</div>
            <div className="text-xs text-text-muted">{w.skills}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => setTask(ex)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted hover:border-primary hover:text-primary"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="Enter a complex task..."
          aria-label="Supervisor task"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => void run()}
          disabled={loading || !task.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "Running..." : "Delegate"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm text-error-text"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.status === "error" && (
            <div
              role="alert"
              className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm text-error-text"
            >
              {result.error ?? "The supervisor failed to complete the task"}
            </div>
          )}

          {result.delegationChain.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-text">Delegation Chain</h2>
              {result.delegationChain.map((step, i) => (
                <div
                  key={`${step.from}-${step.to}-${i}`}
                  className="rounded-lg border border-border bg-surface p-4 text-sm"
                >
                  <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                    <span className="rounded bg-background px-2 py-0.5 border border-border">
                      {step.from}
                    </span>
                    <span>→</span>
                    <span className="rounded bg-background px-2 py-0.5 border border-border">
                      {step.to}
                    </span>
                    {step.error && (
                      <span className="text-error-text">failed</span>
                    )}
                  </div>
                  <div className="mb-1 text-text-muted">
                    <span className="font-medium text-text">Task:</span>{" "}
                    {step.task}
                  </div>
                  <div className="rounded bg-background p-2 text-text-muted border border-border">
                    {step.error ? `Error: ${step.error}` : step.result}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-primary">Final Result</h2>
              <span className="text-xs text-text-muted">
                {result.tokenUsage} tokens
              </span>
            </div>
            <div className="whitespace-pre-wrap text-sm text-text">
              {result.result || "No result was produced."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
