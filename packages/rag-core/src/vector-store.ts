import type {
  Chunk,
  SearchResult,
  VectorEmbedding,
  VectorStore,
} from "./types.js";
import { RAGError } from "./errors.js";

export class InMemoryVectorStore implements VectorStore {
  private embeddings = new Map<string, VectorEmbedding>();
  private chunks = new Map<string, Chunk>();
  private maxVectors: number;

  constructor(options: { maxVectors?: number } = {}) {
    this.maxVectors = options.maxVectors ?? 10000;
  }

  async add(embeddings: VectorEmbedding[]): Promise<void> {
    for (const emb of embeddings) {
      const first = this.embeddings.values().next().value as
        | VectorEmbedding
        | undefined;
      const reference = first ?? emb;
      if (emb.vector.length !== reference.vector.length) {
        throw new RAGError("Vector dimensions must match");
      }
    }

    const projected = this.embeddings.size + countNew(this.embeddings, embeddings);
    if (projected > this.maxVectors) {
      throw new RAGError(
        `Vector store capacity exceeded (max ${this.maxVectors} vectors)`
      );
    }

    for (const emb of embeddings) {
      this.embeddings.set(emb.chunkId, emb);
    }
  }

  registerChunks(chunks: Chunk[]): void {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  async search(query: number[], topK: number): Promise<SearchResult[]> {
    const scored: Array<{ embedding: VectorEmbedding; score: number }> = [];

    for (const embedding of this.embeddings.values()) {
      const score = cosineSimilarity(query, embedding.vector);
      scored.push({ embedding, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const results: SearchResult[] = [];
    for (const item of scored) {
      if (results.length >= topK) break;
      const chunk = this.chunks.get(item.embedding.chunkId);
      if (!chunk) continue;
      results.push({ chunk, score: item.score });
    }
    return results;
  }

  async delete(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      this.embeddings.delete(id);
      this.chunks.delete(id);
    }
  }

  clear(): void {
    this.embeddings.clear();
    this.chunks.clear();
  }

  size(): number {
    return this.embeddings.size;
  }
}

function countNew(
  existing: Map<string, VectorEmbedding>,
  incoming: VectorEmbedding[]
): number {
  let count = 0;
  for (const emb of incoming) {
    if (!existing.has(emb.chunkId)) count++;
  }
  return count;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new RAGError("Vector dimensions must match");

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dotProduct += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
