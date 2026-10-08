import { describe, it, expect } from "vitest";
import { BaseLLMProvider } from "@ai-portfolio/llm-integrations";
import type {
  LLMOptions,
  LLMResponse,
  Message,
  Stream,
} from "@ai-portfolio/llm-integrations";
import { RAGPipeline } from "../src/pipeline.js";
import { MockEmbeddingProvider } from "../src/embeddings.js";
import { InMemoryVectorStore } from "../src/vector-store.js";
import { EmptyStoreError } from "../src/errors.js";

class StubLLM extends BaseLLMProvider {
  readonly name = "stub";
  calls: Message[][] = [];
  streamCalls: Message[][] = [];
  response = "stubbed answer";

  async chat(messages: Message[], _options?: LLMOptions): Promise<LLMResponse> {
    this.calls.push(messages);
    return {
      content: this.response,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      finishReason: "stop",
    };
  }

  async *stream(messages: Message[], _options?: LLMOptions): Stream {
    this.streamCalls.push(messages);
    yield { content: "stubbed ", done: false };
    yield { content: "answer", done: false };
    yield {
      content: "",
      done: true,
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };
  }

  supportsTools(): boolean {
    return false;
  }
}

function makePipeline(options?: { contextualize?: boolean }) {
  const llm = new StubLLM({});
  const store = new InMemoryVectorStore();
  const pipeline = new RAGPipeline(
    new MockEmbeddingProvider(32),
    llm,
    store,
    options ?? {}
  );
  return { pipeline, llm, store };
}

const docs = [
  {
    id: "alpha",
    content: "Alpha document about vector databases and embeddings.",
    metadata: { category: "tech" },
  },
  {
    id: "beta",
    content: "Beta document about cooking pasta with tomato sauce.",
    metadata: { category: "food" },
  },
];

describe("RAGPipeline", () => {
  it("returns real ingest stats", async () => {
    const { pipeline } = makePipeline();
    const stats = await pipeline.ingest(docs);
    expect(stats.documents).toBe(2);
    expect(stats.chunks).toBeGreaterThan(0);
    expect(stats.embedded).toBe(stats.chunks);
    expect(stats.failed).toBe(0);
  });

  it("replaces stale chunks on re-ingest", async () => {
    const { pipeline, store } = makePipeline();
    await pipeline.ingest([{ id: "alpha", content: "one ".repeat(400) }]);
    const first = store.size();
    expect(first).toBeGreaterThan(1);
    await pipeline.ingest([{ id: "alpha", content: "tiny" }]);
    expect(store.size()).toBeLessThan(first);
  });

  it("throws EmptyStoreError on query without documents", async () => {
    const { pipeline } = makePipeline();
    await expect(pipeline.query("anything")).rejects.toThrow(EmptyStoreError);
  });

  it("throws EmptyStoreError on streamQuery without documents", async () => {
    const { pipeline } = makePipeline();
    const events: unknown[] = [];
    await expect(async () => {
      for await (const event of pipeline.streamQuery("q")) {
        events.push(event);
      }
    }).rejects.toThrow(EmptyStoreError);
    expect(events).toEqual([]);
  });

  it("returns sources with provenance", async () => {
    const { pipeline } = makePipeline();
    await pipeline.ingest(docs);
    const result = await pipeline.query("tell me about pasta");
    expect(result.answer).toBe("stubbed answer");
    expect(result.sources.length).toBeGreaterThan(0);
    const source = result.sources[0]!;
    expect(source.chunkId).toContain("chunk_");
    expect(["alpha", "beta"]).toContain(source.documentId);
    expect(typeof source.score).toBe("number");
    expect(source.metadata).toBeDefined();
    expect(result.usage?.totalTokens).toBe(3);
  });

  it("filters sources by minScore", async () => {
    const { pipeline } = makePipeline();
    await pipeline.ingest(docs);
    const result = await pipeline.query("anything", { minScore: 1.1 });
    expect(result.sources).toEqual([]);
  });

  it("uses the same system prompt for query and streamQuery", async () => {
    const { pipeline, llm } = makePipeline();
    await pipeline.ingest(docs);
    await pipeline.query("q1");
    const streamed: unknown[] = [];
    for await (const event of pipeline.streamQuery("q2")) {
      streamed.push(event);
    }
    expect(streamed.length).toBeGreaterThan(0);
    const querySystem = llm.calls[0]?.find((m) => m.role === "system")?.content;
    const streamSystem = llm.streamCalls[0]?.find((m) => m.role === "system")?.content;
    expect(querySystem).toBeDefined();
    expect(querySystem).toBe(streamSystem);
    expect(querySystem).toContain("If the context doesn't contain the answer, say so.");
  });

  it("streams context first, then chunks", async () => {
    const { pipeline } = makePipeline();
    await pipeline.ingest(docs);
    const events = [];
    for await (const event of pipeline.streamQuery("pasta")) {
      events.push(event);
    }
    expect(events[0]?.type).toBe("context");
    const chunks = events.filter((e) => e.type === "chunk");
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("prepends LLM-generated context when contextualize is enabled", async () => {
    const { pipeline, llm } = makePipeline({ contextualize: true });
    llm.response = "This chunk explains the document topic.";
    await pipeline.ingest(docs);
    expect(llm.calls.length).toBeGreaterThan(0);
    const contextCall = llm.calls[0];
    expect(contextCall?.some((m) => m.content.includes("Chunk:"))).toBe(true);
  });
});
