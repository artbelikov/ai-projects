import { describe, it, expect } from "vitest";
import { BaseLLMProvider, type LLMResponse, type Message, type Stream } from "@ai-portfolio/llm-integrations";
import { ReActAgent } from "../src/react-agent.js";
import { ConversationMemory } from "../src/memory.js";
import { calculatorTool } from "../src/tools.js";

class ScriptedLLM extends BaseLLMProvider {
  readonly name = "scripted";
  history: Message[][] = [];
  private index = 0;

  constructor(
    private responses: Array<LLMResponse | Error>,
    private capture: Message[][] = []
  ) {
    super({});
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    this.history.push([...messages]);
    this.capture.push([...messages]);
    const next = this.responses[Math.min(this.index, this.responses.length - 1)];
    this.index++;
    if (next instanceof Error) throw next;
    if (!next) throw new Error("no scripted response");
    return next;
  }

  async *stream(): Stream {
    yield { content: "", done: true };
  }

  supportsTools(): boolean {
    return false;
  }
}

function text(content: string): LLMResponse {
  return { content, finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
}

describe("ReActAgent", () => {
  it("runs a tool then returns a final answer", async () => {
    const llm = new ScriptedLLM([
      text('Thought: I should calculate\nAction: calculator({"expression": "15 * 85.50"})'),
      text("Thought: I have the result\nFinal Answer: The tip base is 1282.5"),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 5 });
    const result = await agent.run("Calculate 15% tip on $85.50");

    expect(result.status).toBe("success");
    expect(result.answer).toBe("The tip base is 1282.5");
    expect(result.tokenUsage).toBe(4);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.action?.tool).toBe("calculator");
    expect(result.steps[0]?.observation).toBe("1282.5");
  });

  it("returns parse_error after two consecutive malformed responses", async () => {
    const llm = new ScriptedLLM([
      text("Sure! Let me think about that."),
      text("Hmm, interesting question."),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 5 });
    const result = await agent.run("do something");

    expect(result.status).toBe("parse_error");
    expect(result.answer).toBe("");
    expect(result.error).toContain("required format");
  });

  it("aborts on repeated identical actions", async () => {
    const llm = new ScriptedLLM([
      text('Thought: try\nAction: calculator({"expression": "1/0"})'),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 10 });
    const result = await agent.run("loop forever");

    expect(result.status).toBe("error");
    expect(result.error).toContain("repeating");
  });

  it("returns max_iterations with an empty answer", async () => {
    const llm = new ScriptedLLM([
      text('Thought: step\nAction: calculator({"expression": "1 + 1"})'),
      text('Thought: step\nAction: calculator({"expression": "1 + 1"})'),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 2 });
    const result = await agent.run("never finish");

    expect(result.status).toBe("max_iterations");
    expect(result.answer).toBe("");
    expect(result.steps).toHaveLength(2);
  });

  it("preserves steps when the LLM throws mid-run", async () => {
    const llm = new ScriptedLLM([
      text('Thought: try\nAction: calculator({"expression": "1 + 1"})'),
      new Error("provider exploded"),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 5 });
    const result = await agent.run("do it");

    expect(result.status).toBe("error");
    expect(result.error).toContain("provider exploded");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.observation).toBe("2");
  });

  it("feeds invalid JSON args back as an observation and continues", async () => {
    const llm = new ScriptedLLM([
      text("Thought: try\nAction: calculator(not json)"),
      text('Thought: retry\nAction: calculator({"expression": "2 + 2"})'),
      text("Thought: done\nFinal Answer: 4"),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 5 });
    const result = await agent.run("compute");

    expect(result.status).toBe("success");
    expect(result.steps[0]?.observation).toContain("valid JSON");
  });

  it("calls onStep for every step", async () => {
    const seen: number[] = [];
    const llm = new ScriptedLLM([
      text('Thought: try\nAction: calculator({"expression": "1 + 1"})'),
      text("Thought: done\nFinal Answer: 2"),
    ]);
    const agent = new ReActAgent(llm, [calculatorTool], {
      maxIterations: 5,
      onStep: (step) => seen.push(step.iteration),
    });
    await agent.run("compute");
    expect(seen).toEqual([0, 1]);
  });

  it("uses memory across runs", async () => {
    const memory = new ConversationMemory();
    const capture: Message[][] = [];
    const llm = new ScriptedLLM([text("Thought: done\nFinal Answer: first")], capture);
    const agent = new ReActAgent(llm, [calculatorTool], { maxIterations: 5, memory });

    await agent.run("first task");
    const llm2 = new ScriptedLLM([text("Thought: done\nFinal Answer: second")], capture);
    const agent2 = new ReActAgent(llm2, [calculatorTool], { maxIterations: 5, memory });
    await agent2.run("second task");

    const secondRun = capture[1] ?? [];
    expect(secondRun.some((m) => m.content === "first task")).toBe(true);
  });
});
