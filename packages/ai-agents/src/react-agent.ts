import type {
  BaseLLMProvider,
  LLMOptions,
  Message,
} from "@ai-portfolio/llm-integrations";
import { Tool, runTool, describeSchema } from "./tools.js";
import { ConversationMemory } from "./memory.js";

export interface Step {
  iteration: number;
  thought: string;
  action?: { tool: string; input: string };
  observation?: string;
  finalAnswer?: string;
}

export type RunStatus = "success" | "max_iterations" | "parse_error" | "error";

export interface ReActResult {
  status: RunStatus;
  answer: string;
  steps: Step[];
  tokenUsage: number;
  error?: string;
}

export interface ReActAgentOptions {
  maxIterations?: number;
  memory?: ConversationMemory;
  onStep?: (step: Step) => void;
}

interface ParsedResponse {
  thought: string;
  action?: { tool: string; input: string };
  finalAnswer?: string;
}

const FORMAT_ERROR_OBSERVATION =
  'Error: Your response did not follow the required format. Respond with EXACTLY one of: "Thought: <reasoning>\\nAction: <tool>({...})" OR "Thought: <reasoning>\\nFinal Answer: <answer>".';

function findLineStart(raw: string, label: string): number {
  const regex = new RegExp(`^${label}:`, "m");
  const match = regex.exec(raw);
  return match ? match.index : -1;
}

function extractAction(
  raw: string,
  start: number
): { tool: string; input: string } | undefined {
  const lineEnd = raw.indexOf("\n", start);
  const firstLine = raw.slice(start, lineEnd === -1 ? raw.length : lineEnd);
  const head = /^Action:\s*([A-Za-z0-9_-]+)\s*\(/.exec(firstLine);
  if (!head || head.index !== 0) return undefined;

  const tool = head[1] ?? "";
  const openIndex = start + (head[0].length - 1);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < raw.length; i++) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) {
        return { tool, input: raw.slice(openIndex + 1, i).trim() };
      }
    }
  }

  return { tool, input: raw.slice(openIndex + 1).trim() };
}

export function parseAgentResponse(raw: string): ParsedResponse {
  const actionStart = findLineStart(raw, "Action");
  const finalStart = findLineStart(raw, "Final Answer");

  if (finalStart !== -1 && (actionStart === -1 || finalStart < actionStart)) {
    const before = raw.slice(0, finalStart).trim();
    const after = raw.slice(finalStart);
    const value = after.replace(/^Final Answer:/, "").trim();
    return {
      thought: before.replace(/^Thought:/, "").trim(),
      finalAnswer: value,
    };
  }

  if (actionStart !== -1) {
    const action = extractAction(raw, actionStart);
    const before = raw.slice(0, actionStart).trim();
    return {
      thought: before.replace(/^Thought:/, "").trim(),
      action,
    };
  }

  const thoughtOnly = raw.trim().replace(/^Thought:/, "").trim();
  return { thought: thoughtOnly };
}

export class ReActAgent {
  private maxIterations: number;
  private memory?: ConversationMemory;
  private onStep?: (step: Step) => void;

  constructor(
    private llmProvider: BaseLLMProvider,
    private tools: Tool[],
    options: ReActAgentOptions = {}
  ) {
    this.maxIterations = options.maxIterations ?? 10;
    this.memory = options.memory;
    this.onStep = options.onStep;
  }

  async run(
    task: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<ReActResult> {
    const toolDescriptions = this.tools
      .map((t) => `- ${t.name}: ${t.description}\n  Parameters: ${describeSchema(t.parameters)}`)
      .join("\n");

    const systemPrompt = `You are a reasoning agent that solves tasks step by step.
You have access to the following tools:
${toolDescriptions || "(no tools available)"}

Respond using EXACTLY one of these formats:

Thought: <your reasoning about what to do next>
Action: <tool_name>(<JSON object with parameters>)

OR when you have the final answer:

Thought: <your reasoning>
Final Answer: <your answer to the user's task>

Rules:
- Do not combine Action and Final Answer in the same response.
- Action must be on its own line immediately after Thought.
- The input to Action must be valid JSON inside the parentheses.`;

    const history: Message[] = [{ role: "system", content: systemPrompt }];
    if (this.memory) {
      history.push(...this.memory.getMessages());
    }
    history.push({ role: "user", content: `Task: ${task}` });

    const steps: Step[] = [];
    let tokenUsage = 0;
    let consecutiveFormatErrors = 0;
    let repeatCount = 0;
    let lastSignature = "";

    const llmOptions: LLMOptions = {
      temperature: 0.2,
      maxTokens: 800,
      signal: options.signal,
    };

    for (let i = 0; i < this.maxIterations; i++) {
      let raw: string;
      try {
        const response = await this.llmProvider.chat(history, llmOptions);
        tokenUsage += response.usage?.totalTokens ?? 0;
        raw = response.content;
      } catch (err) {
        return {
          status: "error",
          answer: "",
          steps,
          tokenUsage,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const parsed = parseAgentResponse(raw);

      if (parsed.finalAnswer !== undefined && parsed.finalAnswer !== "") {
        const step: Step = {
          iteration: i,
          thought: parsed.thought,
          finalAnswer: parsed.finalAnswer,
        };
        steps.push(step);
        this.onStep?.(step);
        this.remember(task, parsed.finalAnswer);
        return { status: "success", answer: parsed.finalAnswer, steps, tokenUsage };
      }

      if (parsed.action) {
        consecutiveFormatErrors = 0;
        const { tool: toolName, input: toolInputRaw } = parsed.action;
        const tool = this.tools.find(
          (t) => t.name.toLowerCase() === toolName.toLowerCase()
        );

        const signature = `${toolName}:${toolInputRaw}`;
        if (signature === lastSignature) {
          repeatCount++;
        } else {
          repeatCount = 0;
          lastSignature = signature;
        }
        if (repeatCount >= 3) {
          return {
            status: "error",
            answer: "",
            steps,
            tokenUsage,
            error: `Agent is repeating the same action (${toolName}) and is unlikely to progress`,
          };
        }

        let observation: string;
        if (!tool) {
          observation = `Error: Tool "${toolName}" not found. Available: ${this.tools
            .map((t) => t.name)
            .join(", ")}`;
        } else {
          let parsedInput: unknown;
          try {
            parsedInput = JSON.parse(toolInputRaw);
          } catch {
            observation = `Error: Action input must be valid JSON. Got: ${toolInputRaw}`;
            const step: Step = {
              iteration: i,
              thought: parsed.thought,
              action: { tool: toolName, input: toolInputRaw },
              observation,
            };
            steps.push(step);
            this.onStep?.(step);
            history.push({ role: "assistant", content: raw });
            history.push({ role: "user", content: `Observation: ${observation}` });
            continue;
          }
          observation = await runTool(tool, parsedInput);
        }

        const step: Step = {
          iteration: i,
          thought: parsed.thought,
          action: { tool: toolName, input: toolInputRaw },
          observation,
        };
        steps.push(step);
        this.onStep?.(step);

        history.push({ role: "assistant", content: raw });
        history.push({ role: "user", content: `Observation: ${observation}` });
        continue;
      }

      consecutiveFormatErrors++;
      const step: Step = {
        iteration: i,
        thought: parsed.thought,
        observation: FORMAT_ERROR_OBSERVATION,
      };
      steps.push(step);
      this.onStep?.(step);

      if (consecutiveFormatErrors >= 2) {
        return {
          status: "parse_error",
          answer: "",
          steps,
          tokenUsage,
          error: "Agent failed to produce a response in the required format",
        };
      }

      history.push({ role: "assistant", content: raw });
      history.push({ role: "user", content: `Observation: ${FORMAT_ERROR_OBSERVATION}` });
    }

    return {
      status: "max_iterations",
      answer: "",
      steps,
      tokenUsage,
      error: "Reached maximum iterations without a final answer",
    };
  }

  private remember(task: string, answer: string): void {
    if (!this.memory) return;
    this.memory.add({ role: "user", content: task });
    this.memory.add({ role: "assistant", content: answer });
  }
}
