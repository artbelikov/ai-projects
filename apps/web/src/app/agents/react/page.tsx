"use client";

import { useState } from "react";
import { postJson, ApiError } from "../../../lib/api";

interface Step {
  iteration: number;
  thought: string;
  action?: { tool: string; input: string };
  observation?: string;
  finalAnswer?: string;
}

interface ReActResponse {
  status: "success" | "max_iterations" | "parse_error" | "error";
  answer: string;
  steps: Step[];
  tokenUsage: number;
  error?: string;
}

const examples = [
  "Calculate 15% tip on $85.50",
  "What is the weather in Tokyo and should I pack an umbrella?",
  "Fetch document 'rag-guide' and summarize it",
];

const statusLabels: Record<ReActResponse["status"], string> = {
  success: "Completed",
  max_iterations: "Stopped: iteration limit reached",
  parse_error: "Stopped: the model produced an invalid format",
  error: "Failed",
};

export default function ReActPage() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState<ReActResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postJson<ReActResponse>("/agents/react", { task });
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
      <h1 className="text-2xl font-bold text-text">ReAct Agent</h1>
      <p className="text-sm text-text-muted">
        The agent reasons step-by-step, decides which tool to use, observes the
        result, and repeats until it reaches a final answer.
      </p>

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
          placeholder="Enter a task for the agent..."
          aria-label="Agent task"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => void run()}
          disabled={loading || !task.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "Running..." : "Run"}
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
          {result.status !== "success" && (
            <div
              role="alert"
              className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm text-error-text"
            >
              {statusLabels[result.status]}
              {result.error ? `: ${result.error}` : ""}
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-primary">Final Answer</h2>
              <span className="text-xs text-text-muted">
                {result.tokenUsage} tokens · {statusLabels[result.status]}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-sm text-text">
              {result.answer || "No answer was produced."}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold text-text">Reasoning Steps</h2>
            {result.steps.map((step) => (
              <div
                key={`${step.iteration}-${step.action?.tool ?? "final"}`}
                className="rounded-lg border border-border bg-background p-4 text-sm"
              >
                <div className="mb-2 text-xs font-medium text-primary">
                  Step {step.iteration + 1}
                </div>
                <div className="mb-2 text-text-muted">
                  <span className="font-medium text-text">Thought:</span>{" "}
                  {step.thought}
                </div>
                {step.action && (
                  <div className="mb-2 rounded bg-surface p-2 font-mono text-xs text-primary border border-border">
                    Action: {step.action.tool}({step.action.input})
                  </div>
                )}
                {step.observation && (
                  <div className="text-text-muted">
                    <span className="font-medium text-text">Observation:</span>{" "}
                    {step.observation}
                  </div>
                )}
                {step.finalAnswer && (
                  <div className="mt-2 rounded bg-surface p-2 text-primary border border-border">
                    Final Answer: {step.finalAnswer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
