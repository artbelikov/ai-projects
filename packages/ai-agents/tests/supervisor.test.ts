import { describe, it, expect } from "vitest";
import {
  BaseLLMProvider,
  type LLMResponse,
  type Stream,
} from "@ai-portfolio/llm-integrations";
import { Supervisor } from "../src/supervisor.js";
import { ReActAgent } from "../src/react-agent.js";

class ScriptedLLM extends BaseLLMProvider {
  readonly name = "scripted";
  private index = 0;

  constructor(private responses: Array<LLMResponse | Error>) {
    super({});
  }

  async chat(): Promise<LLMResponse> {
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

function makeWorkers(provider: BaseLLMProvider) {
  const analystLLM = provider;
  return [
    {
      name: "analyst",
      description: "Analyzes data",
      expertise: ["math"],
      agent: new ReActAgent(analystLLM, [], { maxIterations: 3 }),
    },
    {
      name: "writer",
      description: "Writes summaries",
      expertise: ["writing"],
      agent: new ReActAgent(analystLLM, [], { maxIterations: 3 }),
    },
  ];
}

describe("Supervisor", () => {
  it("returns a direct answer without delegation", async () => {
    const llm = new ScriptedLLM([text("Direct Answer: 42")]);
    const supervisor = new Supervisor(llm, makeWorkers(new ScriptedLLM([])));
    const result = await supervisor.delegate("what is the answer");

    expect(result.status).toBe("success");
    expect(result.result).toBe("42");
    expect(result.delegationChain).toEqual([]);
    expect(result.tokenUsage).toBe(2);
  });

  it("routes to a worker and reviews the result", async () => {
    const workerLLM = new ScriptedLLM([
      text("Thought: done\nFinal Answer: analysis complete"),
    ]);
    const supervisorLLM = new ScriptedLLM([
      text("Route to: analyst\nReason: math task\nContext: analyze the numbers"),
      text("Final Answer: reviewed analysis complete"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(workerLLM));
    const result = await supervisor.delegate("analyze Q3 numbers");

    expect(result.status).toBe("success");
    expect(result.result).toBe("reviewed analysis complete");
    expect(result.delegationChain).toHaveLength(1);
    expect(result.delegationChain[0]?.to).toBe("analyst");
    expect(result.delegationChain[0]?.task).toBe("analyze the numbers");
  });

  it("matches worker names case-insensitively", async () => {
    const workerLLM = new ScriptedLLM([text("Thought: done\nFinal Answer: ok")]);
    const supervisorLLM = new ScriptedLLM([
      text("Route to: Analyst\nReason: match\nContext: do it"),
      text("Final Answer: done"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(workerLLM));
    const result = await supervisor.delegate("task");

    expect(result.status).toBe("success");
  });

  it("returns an error for unknown workers", async () => {
    const supervisorLLM = new ScriptedLLM([
      text("Route to: nobody\nReason: ?\nContext: ?"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(new ScriptedLLM([])));
    const result = await supervisor.delegate("task");

    expect(result.status).toBe("error");
    expect(result.error).toContain("No worker named");
  });

  it("returns an error for unparseable routing", async () => {
    const supervisorLLM = new ScriptedLLM([text("Let me think about this task...")]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(new ScriptedLLM([])));
    const result = await supervisor.delegate("task");

    expect(result.status).toBe("error");
    expect(result.error).toContain("could not be parsed");
  });

  it("records worker failures in the chain", async () => {
    const workerLLM = new ScriptedLLM([new Error("worker exploded")]);
    const supervisorLLM = new ScriptedLLM([
      text("Route to: analyst\nReason: math\nContext: do it"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(workerLLM));
    const result = await supervisor.delegate("task");

    expect(result.status).toBe("error");
    expect(result.delegationChain[0]?.error).toContain("worker exploded");
    expect(result.error).toContain("worker exploded");
  });

  it("reviews re-delegated results too", async () => {
    const workerLLM = new ScriptedLLM([
      text("Thought: done\nFinal Answer: draft v1"),
      text("Thought: done\nFinal Answer: polished v2"),
    ]);
    const supervisorLLM = new ScriptedLLM([
      text("Route to: analyst\nReason: first pass\nContext: draft it"),
      text("Re-delegate to: writer\nReason: needs polish\nContext: polish this"),
      text("Final Answer: final polished output"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(workerLLM));
    const result = await supervisor.delegate("write a report");

    expect(result.status).toBe("success");
    expect(result.result).toBe("final polished output");
    expect(result.delegationChain).toHaveLength(2);
    expect(result.delegationChain[0]?.from).toBe("supervisor");
    expect(result.delegationChain[1]?.from).toBe("analyst");
    expect(result.delegationChain[1]?.to).toBe("writer");
  });

  it("respects maxHops", async () => {
    const workerLLM = new ScriptedLLM([
      text("Thought: done\nFinal Answer: v1"),
      text("Thought: done\nFinal Answer: v2"),
    ]);
    const supervisorLLM = new ScriptedLLM([
      text("Route to: analyst\nReason: start\nContext: do it"),
      text("Re-delegate to: writer\nReason: refine\nContext: refine"),
      text("Re-delegate to: analyst\nReason: refine again\nContext: refine"),
    ]);
    const supervisor = new Supervisor(supervisorLLM, makeWorkers(workerLLM), {
      maxHops: 2,
    });
    const result = await supervisor.delegate("task");

    expect(result.delegationChain.length).toBeLessThanOrEqual(2);
  });
});
