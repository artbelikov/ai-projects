import type { StreamingChunk, TokenUsage } from "@ai-portfolio/llm-integrations";

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorEmbedding {
  chunkId: string;
  vector: number[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export interface Source {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IngestStats {
  documents: number;
  chunks: number;
  embedded: number;
  failed: number;
}

export interface RAGQueryResult {
  answer: string;
  sources: Source[];
  usage?: TokenUsage;
}

export type RAGStreamEvent =
  | { type: "context"; sources: Source[] }
  | { type: "chunk"; data: StreamingChunk };

export interface VectorStore {
  add(embeddings: VectorEmbedding[]): Promise<void>;
  registerChunks(chunks: Chunk[]): void;
  search(query: number[], topK: number): Promise<SearchResult[]>;
  delete(chunkIds: string[]): Promise<void>;
  size(): number;
}
