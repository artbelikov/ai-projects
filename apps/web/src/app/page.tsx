import Link from "next/link";

const features = [
  {
    title: "LLM Playground",
    description:
      "Chat with OpenAI, Anthropic, local Ollama models, or a keyless mock. Streaming responses with token usage tracking.",
    href: "/llm",
    tag: "Multi-Provider",
  },
  {
    title: "RAG Demo",
    description:
      "Ingest documents and ask questions with grounded retrieval, optional contextual chunk enrichment, and source citations.",
    href: "/rag",
    tag: "Vector Search",
  },
  {
    title: "ReAct Agent",
    description:
      "Watch an autonomous agent reason step-by-step, use tools, and solve multi-step tasks with visible reasoning traces.",
    href: "/agents/react",
    tag: "Tool Use",
  },
  {
    title: "Multi-Agent Supervisor",
    description:
      "See a supervisor delegate tasks to specialized workers, review results, and synthesize a final answer.",
    href: "/agents/supervisor",
    tag: "Orchestration",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text">
          Full-Stack AI Portfolio
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-text-muted">
          Demonstrations of LLM integrations, RAG systems, and autonomous AI
          agents. Built with TypeScript, Fastify, and Next.js. Runs keyless with
          the built-in mock provider.
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-xs text-text-muted">
          <span className="rounded-full bg-surface px-3 py-1 border border-border">TypeScript</span>
          <span className="rounded-full bg-surface px-3 py-1 border border-border">Fastify</span>
          <span className="rounded-full bg-surface px-3 py-1 border border-border">Next.js</span>
          <span className="rounded-full bg-surface px-3 py-1 border border-border">Tailwind</span>
          <span className="rounded-full bg-surface px-3 py-1 border border-border">Vitest</span>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group block rounded-xl border border-border bg-surface p-6 transition hover:border-primary"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-text group-hover:text-primary">
                {f.title}
              </h2>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-primary border border-border">
                {f.tag}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">{f.description}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Quick Start</h2>
        <pre className="overflow-x-auto rounded-lg bg-background p-4 text-sm text-text-muted">
{`# Install dependencies
pnpm install

# Start API + Web concurrently
pnpm dev

# API runs on http://localhost:4000
# Web runs on http://localhost:3000
# API docs at http://localhost:4000/docs`}
        </pre>
      </section>
    </div>
  );
}
