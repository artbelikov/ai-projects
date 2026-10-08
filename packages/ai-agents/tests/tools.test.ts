import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runTool, describeSchema, calculatorTool, webSearchTool, fetchDocumentTool, datetimeTool } from "../src/tools.js";
import type { Tool } from "../src/tools.js";

describe("runTool", () => {
  it("executes with valid args", async () => {
    const result = await runTool(calculatorTool, { expression: "2 + 2" });
    expect(result).toBe("4");
  });

  it("returns a validation error string for bad args", async () => {
    const result = await runTool(calculatorTool, { expression: 42 });
    expect(result).toContain("Invalid arguments for \"calculator\"");
  });

  it("returns an error string when execute throws", async () => {
    const throwing: Tool<z.ZodObject<{ x: z.ZodString }>> = {
      name: "boom",
      description: "throws",
      parameters: z.object({ x: z.string() }),
      async execute() {
        throw new Error("kaboom");
      },
    };
    const result = await runTool(throwing, { x: "1" });
    expect(result).toContain("Error executing tool \"boom\"");
    expect(result).toContain("kaboom");
  });
});

describe("describeSchema", () => {
  it("describes object parameters without zod internals", () => {
    const description = describeSchema(calculatorTool.parameters);
    expect(description).toContain("expression");
    expect(description).toContain("string");
    expect(description).not.toContain("_def");
    expect(description).not.toContain("ZodString");
    expect(description).not.toContain("typeName");
  });
});

describe("tools", () => {
  it("calculator rejects invalid expressions with a clear error", async () => {
    const result = await runTool(calculatorTool, { expression: "process.exit(1)" });
    expect(result).toContain("Invalid expression");
  });

  it("fetchDocument handles prototype-chain names safely", async () => {
    const result = await runTool(fetchDocumentTool, { documentId: "constructor" });
    expect(result).toContain("not found");
    const real = await runTool(fetchDocumentTool, { documentId: "rag-guide" });
    expect(real).toContain("Retrieval-Augmented Generation");
  });

  it("webSearch matches by keyword overlap regardless of order", async () => {
    const reordered = await runTool(webSearchTool, { query: "japan population" });
    expect(reordered).toContain("125 million");
    const noMatch = await runTool(webSearchTool, { query: "quantum knitting" });
    expect(noMatch).toContain("No direct results");
  });

  it("datetime returns a single consistent timestamp", async () => {
    const raw = await runTool(datetimeTool, {});
    const parsed = JSON.parse(raw) as { iso: string; local: string; utc: string };
    expect(new Date(parsed.iso).toISOString()).toBe(parsed.iso);
    expect(parsed.utc).toBeTruthy();
  });
});
