# Package Spec: `@ai-portfolio/rag-core`

## Purpose
Implement a complete Retrieval-Augmented Generation pipeline: document ingestion, chunking, embedding, vector storage, and context-aware response generation.

## Components

### 1. Chunking (`chunking.ts`)
- **Algorithm**: Recursive character text splitting with configurable separators
- **Config**: `chunkSize` (default 500), `chunkOverlap` (default 50), `separators` (\n\n, \n, " ", "")
- **Output**: Array of `Chunk` objects with stable IDs and metadata

### 2. Embeddings (`embeddings.ts`)
- **OpenAIEmbeddingProvider**: Calls `text-embedding-3-small` via REST
- **MockEmbeddingProvider**: Deterministic hash-based vectors for offline/demo use
- **Interface**: `embed(texts: string[]): Promise<number[][]>` + `embedQuery(text: string): Promise<number[]>`

### 3. Vector Store (`vector-store.ts`)
- **InMemoryVectorStore**: Cosine-similarity search with Map-based storage
- **Interface**: `add()`, `search(query, topK)`, `delete()`, `clear()`
- **Future**: Pinecone/Qdrant adapter to demonstrate external DB integration

### 4. Pipeline (`pipeline.ts`)
```typescript
class RAGPipeline {
  constructor(embeddingProvider, llmProvider, vectorStore?);
  
  async ingest(documents: Document[]): Promise<void>;
  
  async query(question: string, options?: {
    topK?: number;
    systemPrompt?: string;
  }): Promise<string>;
  
  async *streamQuery(question: string, options?): AsyncGenerator<
    | { type: "context"; data: RetrievedChunk[] }
    | { type: "chunk"; data: StreamingChunk }
  >;
}
```

## Data Flow
```
Documents → Chunking → Embedding → Vector Store
                                          ↑
User Query → Embed Query → Similarity Search → Retrieve Top-K Chunks
                                                  ↓
                                         Build Context Prompt → LLM → Answer
```

## Design Decisions
- **In-memory store default**: Eliminates external dependency for portfolio reviewers
- **Streaming query**: Yields retrieved context first, then LLM tokens; allows UI to show sources before answer
- **Metadata preservation**: Chunks carry document metadata for source attribution

## Error Handling
- Empty vector store returns explicit "No documents ingested" error
- Embedding failures retry once with exponential backoff
- Context length exceeded → truncate chunks by relevance score

## Testing Strategy
- Chunking tests with edge cases (empty docs, very long paragraphs)
- Cosine similarity unit tests
- End-to-end pipeline test with mock embeddings and LLM

## Demo Data
Include a pre-built knowledge base about "AI Engineering Best Practices" so the portfolio works immediately without external APIs.
