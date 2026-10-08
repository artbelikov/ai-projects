import type {
  BaseLLMProvider,
  LLMOptions,
  Message,
} from "@ai-portfolio/llm-integrations";
import type {
  Chunk,
  IngestStats,
  RAGQueryResult,
  RAGStreamEvent,
  Source,
  VectorEmbedding,
  VectorStore,
} from "./types.js";
import type { EmbeddingProvider } from "./embeddings.js";
import type { ChunkingOptions } from "./chunking.js";
import { InMemoryVectorStore } from "./vector-store.js";
import { splitDocuments } from "./chunking.js";
import { EmptyStoreError, EmbeddingError } from "./errors.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant. Use the provided context to answer the question. If the context doesn't contain the answer, say so.";
const DEFAULT_TOP_K = 4;
const DEFAULT_MAX_CONTEXT_CHARS = 6000;
const DEFAULT_TEMPERATURE = 0.3;

export interface RAGOptions {
  topK?: number;
  minScore?: number;
  systemPrompt?: string;
  maxContextChars?: number;
  llm?: LLMOptions;
}

export interface RAGPipelineOptions {
  chunking?: ChunkingOptions;
  contextualize?: boolean;
}

interface IngestDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class RAGPipeline {
  private vectorStore: VectorStore;
  private chunkIdsByDocument = new Map<string, string[]>();
  private chunking: ChunkingOptions;
  private contextualize: boolean;

  constructor(
    private embeddingProvider: EmbeddingProvider,
    private llmProvider: BaseLLMProvider,
    vectorStore: VectorStore = new InMemoryVectorStore(),
    options: RAGPipelineOptions = {}
  ) {
    this.vectorStore = vectorStore;
    this.chunking = options.chunking ?? { chunkSize: 500, chunkOverlap: 50 };
    this.contextualize = options.contextualize ?? false;
  }

  async ingest(
    documents: IngestDocument[],
    options: { chunking?: ChunkingOptions } = {}
  ): Promise<IngestStats> {
    for (const doc of documents) {
      const existing = this.chunkIdsByDocument.get(doc.id);
      if (existing?.length) {
        await this.vectorStore.delete(existing);
        this.chunkIdsByDocument.delete(doc.id);
      }
    }

    const chunks = splitDocuments(documents, options.chunking ?? this.chunking);
    const contents = this.contextualize
      ? await this.contextualizeChunks(chunks, documents)
      : chunks.map((c) => c.content);

    const embeddings = await this.embeddingProvider.embed(contents);

    const vectorEmbeddings: VectorEmbedding[] = [];
    let failed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = embeddings[i];
      if (!chunk) continue;
      if (!vector) {
        failed++;
        continue;
      }
      vectorEmbeddings.push({ chunkId: chunk.id, vector });
    }

    if (chunks.length > 0 && vectorEmbeddings.length === 0) {
      throw new EmbeddingError("Embedding failed for all chunks");
    }

    this.vectorStore.registerChunks(chunks);
    await this.vectorStore.add(vectorEmbeddings);

    for (const doc of documents) {
      const ids = chunks
        .filter((c) => c.documentId === doc.id)
        .map((c) => c.id);
      this.chunkIdsByDocument.set(doc.id, ids);
    }

    return {
      documents: documents.length,
      chunks: chunks.length,
      embedded: vectorEmbeddings.length,
      failed,
    };
  }

  async query(question: string, options: RAGOptions = {}): Promise<RAGQueryResult> {
    if (this.vectorStore.size() === 0) throw new EmptyStoreError();

    const { sources, messages } = await this.buildPrompt(question, options);
    const response = await this.llmProvider.chat(messages, {
      temperature: DEFAULT_TEMPERATURE,
      ...options.llm,
    });

    return { answer: response.content, sources, usage: response.usage };
  }

  async *streamQuery(
    question: string,
    options: RAGOptions = {}
  ): AsyncGenerator<RAGStreamEvent> {
    if (this.vectorStore.size() === 0) throw new EmptyStoreError();

    const { sources, messages } = await this.buildPrompt(question, options);
    yield { type: "context", sources };

    for await (const chunk of this.llmProvider.stream(messages, {
      temperature: DEFAULT_TEMPERATURE,
      ...options.llm,
    })) {
      yield { type: "chunk", data: chunk };
    }
  }

  private async buildPrompt(
    question: string,
    options: RAGOptions
  ): Promise<{ sources: Source[]; messages: Message[] }> {
    const queryEmbedding = await this.embeddingProvider.embedQuery(question);
    const results = await this.vectorStore.search(
      queryEmbedding,
      options.topK ?? DEFAULT_TOP_K
    );

    const minScore = options.minScore;
    const filtered =
      minScore === undefined ? results : results.filter((r) => r.score >= minScore);
    const sources = filtered.map(toSource);

    const context = buildContext(sources, options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS);
    const messages: Message[] = [
      {
        role: "system",
        content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ];

    return { sources, messages };
  }

  private async contextualizeChunks(
    chunks: Chunk[],
    documents: IngestDocument[]
  ): Promise<string[]> {
    const docById = new Map(documents.map((d) => [d.id, d]));
    const out: string[] = [];

    for (const chunk of chunks) {
      const doc = docById.get(chunk.documentId);
      const prompt: Message[] = [
        {
          role: "system",
          content:
            "You situate document chunks inside their parent document. Given the document and one chunk, respond with 1-2 short sentences placing the chunk in context. Respond with the context only.",
        },
        {
          role: "user",
          content: `Document id: ${chunk.documentId}\nDocument content:\n${(doc?.content ?? "").slice(0, 2000)}\n\nChunk:\n${chunk.content.slice(0, 500)}`,
        },
      ];
      const response = await this.llmProvider.chat(prompt, {
        temperature: 0,
        maxTokens: 128,
      });
      const context = response.content.trim();
      out.push(context ? `${context}\n\n${chunk.content}` : chunk.content);
    }

    return out;
  }
}

function toSource(result: { chunk: Chunk; score: number }): Source {
  return {
    chunkId: result.chunk.id,
    documentId: result.chunk.documentId,
    content: result.chunk.content,
    score: result.score,
    metadata: result.chunk.metadata,
  };
}

function buildContext(sources: Source[], maxChars: number): string {
  const parts: string[] = [];
  let used = 0;
  for (const source of sources) {
    const part = source.content;
    if (used + part.length > maxChars) {
      const remaining = maxChars - used;
      if (remaining > 0) parts.push(part.slice(0, remaining));
      break;
    }
    parts.push(part);
    used += part.length + 2;
  }
  return parts.join("\n\n---\n\n");
}
