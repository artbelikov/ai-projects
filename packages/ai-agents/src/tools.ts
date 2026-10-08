import { z } from "zod";
import { evaluateExpression } from "./calculator.js";

export interface Tool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: T;
  execute(args: z.infer<T>): Promise<string>;
}

export async function runTool(tool: Tool, args: unknown): Promise<string> {
  const parsed = tool.parameters.safeParse(args);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "(root)";
    return `Error: Invalid arguments for "${tool.name}": ${path}: ${issue?.message ?? "invalid value"}`;
  }
  try {
    return await tool.execute(parsed.data);
  } catch (err) {
    return `Error executing tool "${tool.name}": ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function describeSchema(schema: z.ZodTypeAny): string {
  return describeType(schema, 0);
}

function describeType(schema: z.ZodTypeAny, depth: number): string {
  if (depth > 4) return "unknown";
  const def = schema._def;

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return `${describeType(def.innerType as z.ZodTypeAny, depth + 1)}${schema instanceof z.ZodOptional ? " (optional)" : " (optional, has default)"}`;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const entries = Object.entries(shape);
    if (entries.length === 0) return "no parameters";
    return entries
      .map(([key, value]) => `${key}: ${describeType(value, depth + 1)}`)
      .join(", ");
  }

  if (schema instanceof z.ZodArray) {
    return `array of ${describeType(def.type as z.ZodTypeAny, depth + 1)}`;
  }

  if (schema instanceof z.ZodEnum) {
    return `one of [${(def.values as string[]).join(", ")}]`;
  }

  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodRecord) return "object";

  return "unknown";
}

export const calculatorTool: Tool<z.ZodObject<{ expression: z.ZodString }>> = {
  name: "calculator",
  description:
    "Evaluate mathematical expressions. Supports + - * / % ^, parentheses, constants (pi, e), and functions sqrt, abs, round, floor, ceil, min, max, sin, cos, tan, log, ln, exp. Input must be a valid math expression like '15 * 85.50' or 'sqrt(144) + 10'.",
  parameters: z.object({ expression: z.string() }),
  execute: async (args) => {
    try {
      return String(evaluateExpression(args.expression));
    } catch {
      return `Error: Invalid expression "${args.expression}"`;
    }
  },
};

export const datetimeTool: Tool<z.ZodObject<Record<string, never>>> = {
  name: "datetime",
  description: "Get the current date and time in ISO format and local timezone.",
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      local: now.toString(),
      utc: now.toUTCString(),
    });
  },
};

const MOCKED_RESULTS: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ["weather", "tokyo", "umbrella", "rain"],
    answer:
      "Current weather in Tokyo: 22C, partly cloudy, 60% chance of rain in the evening.",
  },
  {
    keywords: ["population", "japan"],
    answer: "Japan population is approximately 125 million as of 2024.",
  },
  {
    keywords: ["react", "vue", "frontend", "framework"],
    answer:
      "React and Vue are both popular frontend frameworks. React uses a virtual DOM and JSX. Vue uses a template-based approach with a reactive data model.",
  },
];

export const webSearchTool: Tool<z.ZodObject<{ query: z.ZodString }>> = {
  name: "web_search",
  description: "Search the web for information. Returns mocked results for demo purposes.",
  parameters: z.object({ query: z.string() }),
  execute: async (args) => {
    const tokens = args.query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);

    let best: { entry: (typeof MOCKED_RESULTS)[number]; score: number } | undefined;
    for (const entry of MOCKED_RESULTS) {
      const score = entry.keywords.filter((k) => tokens.includes(k)).length;
      if (!best || score > best.score) best = { entry, score };
    }

    if (best && best.score > 0) return best.entry.answer;
    return `No direct results for "${args.query}". Try a more specific query.`;
  },
};

const KNOWLEDGE_BASE = new Map<string, string>([
  [
    "rag-guide",
    "RAG (Retrieval-Augmented Generation) combines retrieval systems with LLMs to provide grounded answers.",
  ],
  [
    "agent-guide",
    "AI Agents use reasoning loops to solve tasks by selecting and using tools autonomously.",
  ],
  [
    "prompt-guide",
    "Prompt engineering is the practice of designing inputs to get desired outputs from LLMs.",
  ],
]);

export const fetchDocumentTool: Tool<z.ZodObject<{ documentId: z.ZodString }>> = {
  name: "fetch_document",
  description:
    "Fetch a document by ID from the internal knowledge base. Returns the document content if found.",
  parameters: z.object({ documentId: z.string() }),
  execute: async (args) => {
    return (
      KNOWLEDGE_BASE.get(args.documentId) ?? `Document "${args.documentId}" not found.`
    );
  },
};

export const defaultTools: Tool[] = [
  calculatorTool,
  datetimeTool,
  webSearchTool,
  fetchDocumentTool,
];
