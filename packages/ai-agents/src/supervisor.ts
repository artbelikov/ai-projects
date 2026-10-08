import type {
  BaseLLMProvider,
  LLMOptions,
} from "@ai-portfolio/llm-integrations";
import type { ReActResult } from "./react-agent.js";
import { ReActAgent } from "./react-agent.js";

export interface WorkerAgent {
  name: string;
  description: string;
  expertise: string[];
  agent: ReActAgent;
}

export interface DelegationStep {
  from: string;
  to: string;
  task: string;
  result: string;
  error?: string;
}

export interface SupervisorResult {
  status: "success" | "error";
  result: string;
  delegationChain: DelegationStep[];
  tokenUsage: number;
  error?: string;
}

export interface SupervisorOptions {
  maxHops?: number;
}

type Sections = Map<string, string>;

const SECTION_LABELS = [
  "Route to",
  "Reason",
  "Context",
  "Direct Answer",
  "Re-delegate to",
  "Final Answer",
];

function parseSections(raw: string): Sections {
  const lines = raw.split("\n");
  const sections = new Map<string, string[]>();
  let current: string | undefined;

  for (const line of lines) {
    const label = SECTION_LABELS.find((l) =>
      new RegExp(`^${l}:`, "i").test(line.trim())
    );
    if (label) {
      current = label.toLowerCase();
      const rest = line.trim().slice(label.length + 1).trim();
      sections.set(current, [rest]);
    } else if (current) {
      sections.get(current)?.push(line);
    }
  }

  const out: Sections = new Map();
  for (const [key, valueLines] of sections) {
    out.set(key, valueLines.join("\n").trim());
  }
  return out;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export class Supervisor {
  private maxHops: number;

  constructor(
    private llmProvider: BaseLLMProvider,
    private workers: WorkerAgent[],
    options: SupervisorOptions = {}
  ) {
    this.maxHops = options.maxHops ?? 2;
  }

  async delegate(
    task: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<SupervisorResult> {
    const delegationChain: DelegationStep[] = [];
    let tokenUsage = 0;
    const llmOptions: LLMOptions = {
      temperature: 0.2,
      maxTokens: 800,
      signal: options.signal,
    };

    const workerDescriptions = this.workers
      .map(
        (w) =>
          `- ${w.name}: ${w.description}\n  Expertise: ${w.expertise.join(", ")}`
      )
      .join("\n");

    const routingPrompt = `You are a supervisor agent. Your job is to analyze a task and decide which worker agent should handle it.

Available workers:
${workerDescriptions}

Task: ${task}

Respond with EXACTLY one of these formats:

Route to: <worker_name>
Reason: <brief reason>
Context: <context to pass to the worker>

OR if you can answer directly:

Direct Answer: <your answer>`;

    let routingContent: string;
    try {
      const routingResponse = await this.llmProvider.chat(
        [{ role: "user", content: routingPrompt }],
        llmOptions
      );
      tokenUsage += routingResponse.usage?.totalTokens ?? 0;
      routingContent = routingResponse.content;
    } catch (err) {
      return {
        status: "error",
        result: "",
        delegationChain,
        tokenUsage,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const routing = parseSections(routingContent);
    const direct = routing.get("direct answer");
    if (direct) {
      return { status: "success", result: direct, delegationChain, tokenUsage };
    }

    const routeTo = routing.get("route to");
    if (!routeTo) {
      return {
        status: "error",
        result: "",
        delegationChain,
        tokenUsage,
        error: `Supervisor response could not be parsed: ${routingContent.slice(0, 120)}`,
      };
    }

    const worker = this.findWorker(routeTo.split("\n")[0] ?? "");
    if (!worker) {
      return {
        status: "error",
        result: "",
        delegationChain,
        tokenUsage,
        error: `No worker named "${routeTo.split("\n")[0] ?? ""}" found. Available: ${this.workers
          .map((w) => w.name)
          .join(", ")}`,
      };
    }

    let currentWorker = worker;
    let currentTask = routing.get("context") || task;
    let from = "supervisor";
    let lastOutcome: { result: string; error?: string } | undefined;

    for (let hop = 0; hop < this.maxHops; hop++) {
      let workerResult: ReActResult;
      try {
        workerResult = await currentWorker.agent.run(currentTask, {
          signal: options.signal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        delegationChain.push({
          from,
          to: currentWorker.name,
          task: currentTask,
          result: "",
          error: message,
        });
        return {
          status: "error",
          result: "",
          delegationChain,
          tokenUsage,
          error: message,
        };
      }

      tokenUsage += workerResult.tokenUsage;
      const workerError =
        workerResult.status === "success" ? undefined : workerResult.error ?? workerResult.status;

      delegationChain.push({
        from,
        to: currentWorker.name,
        task: currentTask,
        result: workerResult.answer,
        ...(workerError ? { error: workerError } : {}),
      });

      if (workerError) {
        return {
          status: "error",
          result: workerResult.answer,
          delegationChain,
          tokenUsage,
          error: workerError,
        };
      }

      lastOutcome = { result: workerResult.answer };

      const reviewPrompt = `You are the supervisor. A worker has completed a task. Review the result and decide:
1. If the result is satisfactory, provide the final answer to the user.
2. If another worker should refine it, say "Re-delegate to: <worker_name>" with reason.

Available workers:
${workerDescriptions}

Original task: ${task}
Worker (${currentWorker.name}) result: ${workerResult.answer}

Respond with EXACTLY one of these formats:

Final Answer: <the final answer for the user>

OR

Re-delegate to: <worker_name>
Reason: <brief reason>
Context: <refinement instructions for that worker>`;

      let reviewContent: string;
      try {
        const reviewResponse = await this.llmProvider.chat(
          [{ role: "user", content: reviewPrompt }],
          llmOptions
        );
        tokenUsage += reviewResponse.usage?.totalTokens ?? 0;
        reviewContent = reviewResponse.content;
      } catch (err) {
        return {
          status: "error",
          result: workerResult.answer,
          delegationChain,
          tokenUsage,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const review = parseSections(reviewContent);
      const finalAnswer = review.get("final answer");
      if (finalAnswer) {
        return {
          status: "success",
          result: finalAnswer,
          delegationChain,
          tokenUsage,
        };
      }

      const redelegate = review.get("re-delegate to");
      if (redelegate && hop < this.maxHops - 1) {
        const nextWorker = this.findWorker(redelegate.split("\n")[0] ?? "");
        if (nextWorker) {
          from = currentWorker.name;
          currentWorker = nextWorker;
          currentTask =
            review.get("context") ||
            `Refine this result for task "${task}": ${workerResult.answer}`;
          continue;
        }
      }

      return {
        status: "success",
        result: workerResult.answer,
        delegationChain,
        tokenUsage,
      };
    }

    return {
      status: "success",
      result: lastOutcome?.result ?? "",
      delegationChain,
      tokenUsage,
    };
  }

  private findWorker(name: string): WorkerAgent | undefined {
    const target = normalizeName(name);
    return this.workers.find((w) => normalizeName(w.name) === target);
  }
}
