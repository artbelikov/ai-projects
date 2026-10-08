# AI Portfolio

A full-stack AI portfolio showcasing LLM integrations, RAG systems, and autonomous AI agents. Built for Senior Full-Stack AI/ML Engineer roles. Runs end-to-end without any API keys via a deterministic mock provider.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: Fastify (Node.js) with Zod validation, OpenAPI/Swagger, rate limiting
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Language**: TypeScript 5.4+ (strict mode, `noUncheckedIndexedAccess`)
- **Testing**: Vitest (104 tests across packages and API)

## Architecture

```
ai-portfolio/
├── apps/
│   ├── api/              # Fastify REST API (port 4000)
│   └── web/              # Next.js frontend (port 3000)
├── packages/
│   ├── eslint-config/    # Shared ESLint flat configs
│   ├── llm-integrations/ # Unified LLM provider SDK
│   ├── rag-core/         # Document processing + vector search
│   ├── ai-agents/        # ReAct + multi-agent supervisor
│   └── ts-config/        # Shared TypeScript configs
├── specs/                # Architecture and design specs
└── docker-compose.yml
```

Dependency direction: `llm-integrations` ← `rag-core` / `ai-agents` ← `apps/api` ← `apps/web`.

## Features

1. **Multi-Provider LLM Chat** — OpenAI, Anthropic, local Ollama, or a keyless mock provider. SSE streaming with tool-call normalization and token usage reporting.
2. **RAG Pipeline** — Recursive chunking, embeddings (OpenAI or deterministic mock), cosine retrieval with score filtering, optional contextual chunk enrichment, grounded answers with source citations, and empty-store refusal.
3. **ReAct Agent** — Step-by-step reasoning with validated tools (safe expression calculator, datetime, mocked web search, document fetch). Explicit result statuses (`success` / `max_iterations` / `parse_error` / `error`), loop-cycle guard, and full reasoning traces.
4. **Multi-Agent Supervisor** — Routes tasks to Analyst / Researcher / Writer workers, reviews every delegated result (bounded re-delegation), and reports the full delegation chain with token usage.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers (works with zero API keys)
pnpm dev

# API available at http://localhost:4000
# Web app available at http://localhost:3000
# API docs available at http://localhost:4000/docs
```

## Environment Variables

Copy `.env.example` to `.env` at the repo root and fill in values as needed:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Without keys the API falls back to the built-in mock provider and mock embeddings, so every demo page works offline. Set `RAG_LLM_PROVIDER` / `AGENT_LLM_PROVIDER` to `openai`, `anthropic`, `local`, or `mock` to force a provider. Set `RAG_CONTEXTUALIZE=true` to enable contextual chunk enrichment.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/llm/chat` | Chat completion |
| POST | `/llm/chat/stream` | Streaming chat (SSE) |
| GET | `/llm/providers` | List available providers |
| POST | `/rag/ingest` | Ingest documents (returns real chunk stats) |
| POST | `/rag/query` | Query with RAG (returns answer + sources) |
| POST | `/rag/query/stream` | Streaming RAG query (SSE, sources first) |
| POST | `/agents/react` | Run ReAct agent |
| POST | `/agents/supervisor` | Run multi-agent supervisor |

Errors share one envelope: `{ statusCode, error, message, code }` with stable codes (`VALIDATION_ERROR`, `EMPTY_STORE`, `AUTH_ERROR`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR`).

## Testing

```bash
pnpm test        # 104 tests: llm-integrations 28, rag-core 33, ai-agents 32, api 11
pnpm lint        # ESLint (flat config) across all workspaces
pnpm typecheck   # tsc --noEmit across all workspaces
pnpm build       # Turbo build across all workspaces
```

Coverage includes safe-math parsing and injection rejection, chunking edge cases, cosine-similarity zero-norm handling, embedding failure handling, NDJSON stream fragmentation, ReAct loop failure modes (parse errors, cycle guard, iteration limits), supervisor routing failures, and `fastify.inject()` API integration tests.

## Docker

```bash
docker compose up --build
```

Multi-stage images, pinned pnpm, non-root runtime users, and health checks included. `NEXT_PUBLIC_API_URL` is injected at build time via compose build args.

## Scripts

- `pnpm dev` — Start API and Web concurrently
- `pnpm build` — Build all packages and apps
- `pnpm typecheck` — Type-check all workspaces
- `pnpm lint` — Lint all workspaces
- `pnpm test` — Run tests across all workspaces

## License

MIT — see [LICENSE](LICENSE).
