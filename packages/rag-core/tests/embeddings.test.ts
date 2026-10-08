import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MockEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from "../src/embeddings.js";
import { EmbeddingError } from "../src/errors.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MockEmbeddingProvider", () => {
  it("is deterministic", async () => {
    const provider = new MockEmbeddingProvider(16);
    const [a] = await provider.embed(["hello world"]);
    const [b] = await provider.embed(["hello world"]);
    expect(a).toEqual(b);
  });

  it("is order sensitive", async () => {
    const provider = new MockEmbeddingProvider(16);
    const [a, b] = await provider.embed(["abc", "cba"]);
    expect(a).not.toEqual(b);
  });

  it("produces a non-zero vector for empty text", async () => {
    const provider = new MockEmbeddingProvider(16);
    const [vector] = await provider.embed([""]);
    expect(vector?.some((v) => v !== 0)).toBe(true);
  });

  it("normalizes vectors", async () => {
    const provider = new MockEmbeddingProvider(16);
    const [vector] = await provider.embed(["normalise me"]);
    const norm = Math.sqrt((vector ?? []).reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe("OpenAIEmbeddingProvider", () => {
  function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  it("throws EmbeddingError on HTTP failure instead of returning []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, 401)));
    const provider = new OpenAIEmbeddingProvider("sk-test");
    await expect(provider.embed(["x"])).rejects.toThrow(EmbeddingError);
  });

  it("retries once on 429 and succeeds", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate" }, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ embedding: [1, 2] }] })
      );
    vi.stubGlobal("fetch", mock);
    const provider = new OpenAIEmbeddingProvider("sk-test");
    const vectors = await provider.embed(["x"]);
    expect(vectors).toEqual([[1, 2]]);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("rejects empty queries", async () => {
    const provider = new OpenAIEmbeddingProvider("sk-test");
    await expect(provider.embedQuery("   ")).rejects.toThrow(EmbeddingError);
  });

  it("batches inputs larger than 256", async () => {
    const mock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return Promise.resolve(
        jsonResponse({ data: body.input.map(() => ({ embedding: [1] })) })
      );
    });
    vi.stubGlobal("fetch", mock);
    const provider = new OpenAIEmbeddingProvider("sk-test");
    const texts = Array.from({ length: 300 }, (_, i) => `text-${i}`);
    const vectors = await provider.embed(texts);
    expect(vectors).toHaveLength(300);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("throws on malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    const provider = new OpenAIEmbeddingProvider("sk-test");
    await expect(provider.embed(["x"])).rejects.toThrow(EmbeddingError);
  });
});
