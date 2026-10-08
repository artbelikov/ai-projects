# App Spec: `apps/api`

## Purpose
Expose all AI capabilities as a unified REST API with OpenAPI documentation, streaming support, and provider switching.

## Framework
- **Fastify** with `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`
- **Zod** for runtime validation + `fastify-type-provider-zod` (validator and serializer compilers wired)
- **Environment**: `.env` loaded by `src/env.ts` for API keys, provider selection, port

## Endpoints

### Health
```
GET /health
→ { status: "ok", version: "0.1.0" }
```

### LLM
```
POST /llm/chat
Body: { provider?: "openai" | "anthropic" | "local" | "mock", messages: Message[], options?: LLMOptions }
→ { content: string, finishReason?: string, usage?: TokenUsage }

POST /llm/chat/stream
Body: same as above
→ text/event-stream: data frames with StreamingChunk, terminal [DONE], event: error frames on failure
```

### RAG
```
POST /rag/ingest
Body: { documents: { id, content, metadata? }[] }
→ { documents, chunks, embedded, failed }  (real stats)

POST /rag/query
Body: { question: string, topK?: number, minScore?: number }
→ { answer: string, sources: { chunkId, documentId, content, score, metadata }[], usage? }

POST /rag/query/stream
Body: same as above
→ SSE: { type: "context", sources: Source[] } then { type: "chunk", data: StreamingChunk }
```

### Agents
```
POST /agents/react
Body: { task: string, maxIterations?: number }
→ { status: "success" | "max_iterations" | "parse_error" | "error", answer, steps: Step[], tokenUsage, error? }

POST /agents/supervisor
Body: { task: string }
→ { status: "success" | "error", result, delegationChain: DelegationStep[], tokenUsage, error? }
```

## Architecture
```
src/
├── app.ts               # Fastify app factory (buildApp) — used by tests
├── server.ts            # Entry point: loadEnv, listen, graceful shutdown
├── env.ts               # Zero-dependency .env loader
├── sse.ts               # SSE helper: hijack, heartbeats, disconnect abort, error frames
├── routes/
│   ├── llm.ts
│   ├── rag.ts
│   └── agents.ts
└── services/
    ├── llm-service.ts       # Provider resolution + caching (mock fallback)
    ├── rag-service.ts       # Shared RAGPipeline instance
    ├── agent-service.ts     # Agent and supervisor factory
    └── demo-mock.ts         # Deterministic scripted mock handler
```

## State Management
- RAG vector store is in-memory and reset on restart (acceptable for portfolio)
- LLM providers are lazily initialized and cached by type
- Agent runs are stateless; `ConversationMemory` is available opt-in at the package level

## Error Responses
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "question: Required",
  "code": "VALIDATION_ERROR"
}
```
Stable codes: `VALIDATION_ERROR`, `EMPTY_STORE`, `AUTH_ERROR`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR`.

## Security
- CORS restricted to `CORS_ORIGIN` (default `http://localhost:3000`)
- Helmet security headers
- Global rate limit (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW`) plus tighter per-route limits on LLM/agent endpoints
- Request body capped at 1 MB with bounded Zod schemas

## Testing
- Integration tests with `fastify.inject()`
- Mock LLM responses for deterministic agent tests
- SSE stream parsing tests (client and provider level)
