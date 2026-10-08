"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postSse, readSse, type SseEvent } from "../../lib/api";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

type Provider = "openai" | "anthropic" | "local" | "mock";

function isDoneFrame(data: string): boolean {
  return data === "[DONE]";
}

export default function LLMPage() {
  const [provider, setProvider] = useState<Provider>("mock");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setError(null);
    setUsage(null);
    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: userMsg },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setLoading(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await postSse(
        "/llm/chat/stream",
        {
          provider,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg },
          ],
        },
        abort.signal
      );

      for await (const sse of readSse(res)) {
        handleFrame(sse, assistantId);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }

    function handleFrame(sse: SseEvent, targetId: number) {
      if (isDoneFrame(sse.data)) return;
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
        const chunk = JSON.parse(sse.data) as {
          content?: string;
          usage?: Usage;
        };
        if (chunk.content) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId ? { ...m, content: m.content + chunk.content } : m
            )
          );
        }
        if (chunk.usage) setUsage(chunk.usage);
      } catch {
        setError("Received a malformed stream frame");
      }
    }
  }, [input, loading, messages, provider]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-text">LLM Playground</h1>
        <div className="flex items-center gap-3">
          {usage && (
            <span className="text-xs text-text-muted" aria-live="polite">
              {usage.promptTokens} prompt · {usage.completionTokens} completion ·{" "}
              {usage.totalTokens} tokens
            </span>
          )}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            aria-label="LLM provider"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="mock">Mock (keyless)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="local">Local (Ollama)</option>
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm text-error-text"
        >
          {error}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-text-muted">
            Start a conversation with the selected provider. The mock provider
            works without API keys.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-text border border-border"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void sendMessage()}
          placeholder="Type a message..."
          aria-label="Chat message"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        {loading ? (
          <button
            onClick={stop}
            className="rounded-lg border border-error-border bg-error-bg px-4 py-2 text-sm font-medium text-error-text hover:opacity-90"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
