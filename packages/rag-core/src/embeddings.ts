import { withRetry } from "@ai-portfolio/llm-integrations";
import { EmbeddingError } from "./errors.js";

export interface EmbeddingOptions {
  signal?: AbortSignal;
}

export interface EmbeddingProvider {
  readonly dimension?: number;
  embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
  embedQuery(text: string, options?: EmbeddingOptions): Promise<number[]>;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    if (options?.signal?.aborted) throw options.signal.reason ?? new Error("Aborted");
    return texts.map((t) => this.toVector(t));
  }

  async embedQuery(text: string, options?: EmbeddingOptions): Promise<number[]> {
    return this.embed([text], options).then((vectors) => {
      const vector = vectors[0];
      if (!vector) throw new EmbeddingError("Mock embedding produced no vector");
      return vector;
    });
  }

  private toVector(text: string): number[] {
    const vector: number[] = new Array(this.dimension).fill(0);
    const normalized = text.trim();
    if (normalized.length === 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = ((i + 1) % 7) * 0.1 + 0.05;
      }
    } else {
      for (let i = 0; i < normalized.length; i++) {
        const code = normalized.charCodeAt(i);
        const weighted = code * (i + 1);
        const slot = weighted % this.dimension;
        const existing = vector[slot] ?? 0;
        vector[slot] = existing + weighted;
      }
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / (norm || 1));
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private batchSize: number;

  constructor(
    apiKey: string,
    model = "text-embedding-3-small",
    baseUrl = "https://api.openai.com",
    batchSize = 256
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
    this.batchSize = batchSize;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    if (texts.length === 0) return [];
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      batches.push(texts.slice(i, i + this.batchSize));
    }
    const results = await Promise.all(
      batches.map((batch) => this.embedBatch(batch, options))
    );
    return results.flat();
  }

  async embedQuery(text: string, options?: EmbeddingOptions): Promise<number[]> {
    if (!text.trim()) {
      throw new EmbeddingError("Cannot embed an empty query");
    }
    const vectors = await this.embed([text], options);
    const vector = vectors[0];
    if (!vector) throw new EmbeddingError("Embedding response contained no vector");
    return vector;
  }

  private async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    return withRetry(
      "openai-embeddings",
      async () => {
        const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ model: this.model, input: texts }),
          signal: options?.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new EmbeddingError(
            `OpenAI embeddings request failed (HTTP ${response.status}): ${body.slice(0, 300)}`,
            response.status
          );
        }

        const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
        const rows = data.data;
        if (!Array.isArray(rows) || rows.length !== texts.length) {
          throw new EmbeddingError("OpenAI embeddings response was malformed");
        }
        for (const row of rows) {
          if (!Array.isArray(row?.embedding) || row.embedding.length === 0) {
            throw new EmbeddingError("OpenAI embeddings response was malformed");
          }
        }
        return rows.map((row) => row.embedding);
      },
      { maxRetries: 1, signal: options?.signal }
    ).catch((err: unknown) => {
      if (err instanceof EmbeddingError) throw err;
      throw new EmbeddingError(err instanceof Error ? err.message : String(err));
    });
  }
}
