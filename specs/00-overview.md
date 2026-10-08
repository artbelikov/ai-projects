# AI Portfolio Monorepo — Project Overview

## Objective
Build a demonstrative full-stack AI portfolio monorepo that showcases production-minded skills in:
- **LLM Integrations** (OpenAI, Anthropic, local models, keyless mock)
- **RAG Systems** (chunking, embeddings, vector search, retrieval chains)
- **AI Agents** (ReAct, multi-agent orchestration, tool use)

The portfolio is designed for job applications targeting Senior Full-Stack AI/ML Engineer roles.

## Target Audience
- Hiring managers reviewing GitHub portfolios
- Technical interviewers assessing system design and code quality
- Potential clients evaluating AI integration capabilities

## Architecture Principles
1. **Modularity**: Each AI capability lives in its own package with clean interfaces
2. **Provider Abstraction**: LLM providers are swappable via factory pattern
3. **Type Safety**: Full TypeScript coverage with strict settings (`strict` + `noUncheckedIndexedAccess`)
4. **Demonstrability**: Every feature is exposed through a working web UI that runs keyless
5. **Realism**: Code patterns mirror production systems (typed error taxonomy, streaming, retries, cancellation, rate limiting)

## Tech Stack
- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: Fastify (Node.js) with Zod validation
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Language**: TypeScript 5.4+ (strict mode)
- **Testing**: Vitest
- **Containerization**: Docker + docker compose

## Repository Structure
```
ai-portfolio/
├── apps/
│   ├── api/              # Fastify REST API
│   └── web/              # Next.js frontend
├── packages/
│   ├── llm-integrations/ # Unified LLM provider SDK
│   ├── rag-core/         # Document processing + vector search
│   ├── ai-agents/        # Agent runtimes and orchestration
│   ├── eslint-config/    # Shared lint rules
│   └── ts-config/        # Shared TypeScript configs
├── specs/                # This documentation
├── docker-compose.yml
└── README.md
```

## Key Features to Showcase
1. Multi-provider LLM chat with streaming and token usage tracking
2. Document Q&A with grounded retrieval, source citations, and optional contextual chunk enrichment
3. Autonomous agent solving multi-step tasks with validated tools
4. Multi-agent supervisor delegating to specialized workers with reviewed hand-offs
5. Keyless demo mode via a deterministic mock provider and mock embeddings

## Success Criteria
- [x] All packages build without errors
- [x] API serves all endpoints with OpenAPI spec
- [x] Web app provides interactive demos for each AI feature
- [x] Docker compose brings up full stack in one command
- [x] README explains how to run and demonstrates key features
- [x] Test suite passes (`pnpm test`)
- [x] Lint and typecheck pass (`pnpm lint`, `pnpm typecheck`)
