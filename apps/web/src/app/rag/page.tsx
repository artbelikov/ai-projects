"use client";

import { useEffect, useRef, useState } from "react";
import { postJson, postSse, readSse, type SseEvent } from "../../lib/api";

interface Source {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}

interface IngestStats {
  documents: number;
  chunks: number;
  embedded: number;
  failed: number;
}

const seedDocs = [
  {
    id: "rag-guide",
    content:
      "RAG (Retrieval-Augmented Generation) combines retrieval systems with LLMs to provide grounded answers. It typically involves chunking documents, embedding them into a vector space, and retrieving relevant chunks at query time to augment the prompt.",
    metadata: { category: "guide" },
  },
  {
    id: "agent-guide",
    content:
      "AI Agents use reasoning loops to solve tasks by selecting and using tools autonomously. The ReAct pattern interleaves reasoning (Thought) with actions (Action) and observations (Observation) to iteratively approach a solution.",
    metadata: { category: "guide" },
  },
  {
    id: "prompt-guide",
    content:
      "Prompt engineering is the practice of designing inputs to get desired outputs from LLMs. Techniques include chain-of-thought prompting, few-shot examples, and structured output formats.",
    metadata: { category: "guide" },
  },
  {
    id: "vector-db",
    content:
      "Vector databases store high-dimensional embeddings and enable similarity search. Popular options include Pinecone, Qdrant, Weaviate, and pgvector. Cosine similarity and dot product are common metrics.",
    metadata: { category: "tech" },
  },
];

export default function RAGPage() {
  const [ingestStats, setIngestStats] = useState<IngestStats | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function ingest() {
    setLoading(true);
    setError(null);
    try {
      const stats = await postJson<IngestStats>("/rag/ingest", {
        documents: seedDocs,
      });
      setIngestStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    setSources([]);
    setError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await postSse(
        "/rag/query/stream",
        { question, topK: 3 },
        abort.signal
      );

      for await (const sse of readSse(res)) {
        handleFrame(sse);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }

    function handleFrame(sse: SseEvent) {
      if (sse.data === "[DONE]") return;
      if (sse.event === "error") {
        try {
          const payload = JSON.parse(sse.data) as { message?: string };
          setError(payload.message ?? "Stream failed");
        } catch {
          setError("Stream failed");
        }
        return;
      }
      try {
        const event = JSON.parse(sse.data) as {
          type: "context" | "chunk";
          sources?: Source[];
          data?: { content?: string };
        };
        if (event.type === "context" && event.sources) {
          setSources(event.sources);
        } else if (event.type === "chunk" && event.data?.content) {
          setAnswer((prev) => prev + event.data?.content);
        }
      } catch {
        setError("Received a malformed stream frame");
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">RAG Demo</h1>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm text-error-text"
        >
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-text">Documents</h2>
          <div className="flex items-center gap-3">
            {ingestStats && (
              <span className="text-xs text-text-muted">
                {ingestStats.chunks} chunks from {ingestStats.documents} docs
              </span>
            )}
            <button
              onClick={() => void ingest()}
              disabled={loading}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {ingestStats ? "Re-ingest Seed Docs" : "Ingest Seed Docs"}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {seedDocs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg bg-background p-3 text-sm border border-border"
            >
              <div className="mb-1 font-medium text-primary">{doc.id}</div>
              <div className="line-clamp-2 text-text-muted">{doc.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask()}
          placeholder="Ask a question about the documents..."
          aria-label="Question"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => void ask()}
          disabled={loading || !question.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-text">Sources</h3>
          {sources.map((s) => (
            <div
              key={s.chunkId}
              className="rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <div className="mb-1 text-xs text-primary">
                {s.documentId} · score {s.score.toFixed(3)}
              </div>
              <div className="text-text-muted">{s.content}</div>
            </div>
          ))}
        </div>
      )}

      {answer && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 font-semibold text-text">Answer</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-text">
            {answer}
          </div>
        </div>
      )}
    </div>
  );
}
