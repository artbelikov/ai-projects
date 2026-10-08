# App Spec: `apps/web`

## Purpose
Interactive frontend that demonstrates every AI capability in the monorepo. Designed to impress hiring managers with clean UI, real-time streaming, and visualized agent reasoning.

## Framework
- **Next.js 14** App Router
- **Tailwind CSS** for styling
- **Client components** for interactive demos; server components for static pages

## Pages & Features

### 1. Landing Page (`/`)
- Hero section with project title and tech stack tags
- Grid of feature cards linking to demos
- Quick-start instructions

### 2. LLM Playground (`/llm`)
- Chat interface with provider selector (Mock / OpenAI / Anthropic / Local)
- Message history with stable keys
- Real-time streaming with token-by-token display
- Token usage display (prompt/completion/total) from stream usage frames
- Cancellable streaming (Stop button + unmount abort)

### 3. RAG Demo (`/rag`)
- Document ingestion panel with real ingest stats (docs/chunks)
- Question input with "Ask" button
- Answer display with source citations (document id + similarity score)
- Streaming mode with sources rendered before the answer

### 4. Agent ReAct Demo (`/agents/react`)
- Task input field with example chips
- Step-by-step reasoning visualization: Thought → Action → Observation
- Explicit run status banner (success / max_iterations / parse_error / error)
- Final answer panel with token usage

### 5. Multi-Agent Demo (`/agents/supervisor`)
- Task input field with example chips
- Delegation chain visualization (from → to, task, result, errors)
- Worker cards showing expertise
- Final result panel with token usage

## Shared Client Utilities (`src/lib/api.ts`)
- `API_URL` resolution from `NEXT_PUBLIC_API_URL`
- `postJson` / `postSse` with typed `ApiError` (status + code)
- `readSse` — buffered SSE frame parser (`decode(value, { stream: true })`, `\n\n` boundary buffering) resilient to fragmented network chunks

## Design Tokens
- Dark mode default (AI/engineering aesthetic)
- Accent: emerald for AI responses, with WCAG-checked foreground color
- Monospace font for code and tool I/O
- Card-based layout with subtle borders
- Error surfaces (`error-bg` / `error-border` / `error-text`) with `role="alert"`

## State Management
- React `useState` / `useRef` for local UI state
- No global state library needed (portfolio scope)

## API Integration
- Direct fetch from client components to `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`)
- Typed error handling on every call; error boundary at `app/error.tsx`

## Responsive
- Desktop-first layout (primary target: hiring managers on laptops)
- Wrapping nav and flexible grids for basic mobile usability

## Performance
- Buffered streaming updates via functional `setState`
- Static prerendering for all demo shells
