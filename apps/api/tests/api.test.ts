import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { ragService } from "../src/services/rag-service.js";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.RAG_LLM_PROVIDER = "mock";
  process.env.AGENT_LLM_PROVIDER = "mock";
  app = buildApp();
  await app.ready();
});

beforeEach(() => {
  ragService.reset();
});

describe("GET /health", () => {
  it("returns ok with a version", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "0.1.0" });
  });
});

describe("POST /llm/chat", () => {
  it("rejects invalid bodies with a structured error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/llm/chat",
      payload: { provider: "mock", messages: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.statusCode).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/llm/chat",
      payload: {
        provider: "mock",
        messages: [{ role: "user", content: "hi" }],
        extra: true,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("completes a chat with the mock provider without any API keys", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/llm/chat",
      payload: {
        provider: "mock",
        messages: [{ role: "user", content: "hello" }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.content).toBe("string");
    expect(body.content.length).toBeGreaterThan(0);
  });
});

describe("POST /llm/chat/stream", () => {
  it("streams SSE frames with a terminal [DONE]", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/llm/chat/stream",
      payload: {
        provider: "mock",
        messages: [{ role: "user", content: "hello stream" }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("data: ");
    expect(res.body).toContain("[DONE]");
    expect(res.body).toContain("retry: 3000");
  });
});

describe("GET /llm/providers", () => {
  it("always lists mock as available", async () => {
    const res = await app.inject({ method: "GET", url: "/llm/providers" });
    expect(res.statusCode).toBe(200);
    expect(res.json().providers).toContain("mock");
  });
});

describe("POST /rag/ingest", () => {
  it("returns real ingest stats", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rag/ingest",
      payload: {
        documents: [
          { id: "d1", content: "Alpha content about vectors and retrieval." },
          { id: "d2", content: "Beta content about cooking pasta." },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.documents).toBe(2);
    expect(body.chunks).toBeGreaterThan(0);
    expect(body.embedded).toBe(body.chunks);
    expect(body.failed).toBe(0);
  });
});

describe("POST /rag/query", () => {
  it("refuses to answer from an empty store", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rag/query",
      payload: { question: "what is RAG?" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("EMPTY_STORE");
  });

  it("returns an answer with sources after ingest", async () => {
    await app.inject({
      method: "POST",
      url: "/rag/ingest",
      payload: {
        documents: [{ id: "d1", content: "RAG combines retrieval with LLMs." }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/rag/query",
      payload: { question: "what is RAG?", topK: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.answer).toBe("string");
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.sources[0]).toHaveProperty("chunkId");
    expect(body.sources[0]).toHaveProperty("documentId");
  });
});

describe("POST /agents/react", () => {
  it("runs the mock agent and returns structured steps", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/agents/react",
      payload: { task: "Calculate 15% tip on $85.50", maxIterations: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(["success", "max_iterations", "parse_error", "error"]).toContain(body.status);
    expect(Array.isArray(body.steps)).toBe(true);
    expect(typeof body.tokenUsage).toBe("number");
  });
});

describe("POST /agents/supervisor", () => {
  it("delegates and returns a delegation chain", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/agents/supervisor",
      payload: { task: "Analyze Q3 sales data and draft an email summary" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(["success", "error"]).toContain(body.status);
    expect(Array.isArray(body.delegationChain)).toBe(true);
    expect(typeof body.tokenUsage).toBe("number");
  });
});
