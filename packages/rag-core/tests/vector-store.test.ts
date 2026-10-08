import { describe, it, expect } from "vitest";
import { cosineSimilarity, InMemoryVectorStore } from "../src/vector-store.js";
import { RAGError } from "../src/errors.js";
import type { Chunk, VectorEmbedding } from "../src/types.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 instead of NaN for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(RAGError);
  });
});

describe("InMemoryVectorStore", () => {
  function chunk(id: string): Chunk {
    return { id, documentId: "d", content: `content-${id}`, metadata: {} };
  }

  function embedding(chunkId: string, vector: number[]): VectorEmbedding {
    return { chunkId, vector };
  }

  it("ranks search results by similarity", async () => {
    const store = new InMemoryVectorStore();
    store.registerChunks([chunk("a"), chunk("b")]);
    await store.add([embedding("a", [1, 0]), embedding("b", [0, 1])]);
    const results = await store.search([1, 0], 2);
    expect(results.map((r) => r.chunk.id)).toEqual(["a", "b"]);
    expect(results[0]?.score).toBeCloseTo(1);
  });

  it("skips embeddings without registered chunks", async () => {
    const store = new InMemoryVectorStore();
    store.registerChunks([chunk("a")]);
    await store.add([embedding("a", [1, 0]), embedding("ghost", [0.9, 0.1])]);
    const results = await store.search([1, 0], 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("a");
  });

  it("deletes embeddings and chunks together", async () => {
    const store = new InMemoryVectorStore();
    store.registerChunks([chunk("a"), chunk("b")]);
    await store.add([embedding("a", [1, 0]), embedding("b", [0, 1])]);
    await store.delete(["a"]);
    expect(store.size()).toBe(1);
    const results = await store.search([1, 0], 5);
    expect(results.map((r) => r.chunk.id)).toEqual(["b"]);
  });

  it("throws on dimension mismatch at add", async () => {
    const store = new InMemoryVectorStore();
    store.registerChunks([chunk("a"), chunk("b")]);
    await store.add([embedding("a", [1, 0])]);
    await expect(store.add([embedding("b", [1, 0, 0])])).rejects.toThrow(RAGError);
  });

  it("enforces the maxVectors cap", async () => {
    const store = new InMemoryVectorStore({ maxVectors: 1 });
    store.registerChunks([chunk("a"), chunk("b")]);
    await store.add([embedding("a", [1, 0])]);
    await expect(store.add([embedding("b", [0, 1])])).rejects.toThrow(RAGError);
  });
});
