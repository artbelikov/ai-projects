import { describe, it, expect, vi } from "vitest";
import {
  LLMFactory,
  MockProvider,
  LocalProvider,
  AuthenticationError,
  InvalidRequestError,
  RateLimitError,
  NetworkError,
  LLMError,
} from "../src/index.js";
import { mapHttpError, toLLMError, parseRetryAfterMs, withRetry } from "../src/errors.js";

describe("LLMFactory", () => {
  it("rejects missing OpenAI credentials", () => {
    expect(() => LLMFactory.create("openai")).toThrow(AuthenticationError);
  });

  it("rejects missing Anthropic credentials", () => {
    expect(() => LLMFactory.create("anthropic")).toThrow(AuthenticationError);
  });

  it("creates mock providers without credentials", () => {
    const provider = LLMFactory.create("mock");
    expect(provider.name).toBe("mock");
  });

  it("treats config.baseUrl correctly for local providers", () => {
    const provider = LLMFactory.create("local", {
      baseUrl: "http://example.test:11434",
    });
    expect(provider.name).toBe("local");
  });

  it("rejects unknown providers", () => {
    expect(() =>
      LLMFactory.create("nope" as never)
    ).toThrow(InvalidRequestError);
  });
});

describe("error mapping", () => {
  it("maps 401 to AuthenticationError", () => {
    const err = mapHttpError(401, "openai", "bad key");
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.statusCode).toBe(401);
  });

  it("maps 429 to RateLimitError with retry-after", () => {
    const headers = new Headers({ "retry-after": "2" });
    const err = mapHttpError(429, "openai", "slow down", headers);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(2000);
  });

  it("wraps unknown errors as NetworkError", () => {
    const err = toLLMError(new Error("boom"), "local");
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.provider).toBe("local");
  });

  it("preserves LLMError instances", () => {
    const original = new LLMError("x", "openai");
    expect(toLLMError(original, "local")).toBe(original);
  });

  it("parses retry-after headers", () => {
    expect(parseRetryAfterMs(new Headers({ "retry-after": "3" }))).toBe(3000);
    expect(parseRetryAfterMs(new Headers())).toBeUndefined();
  });
});

describe("withRetry", () => {
  it("retries transient failures once", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError("slow", "openai", 0))
      .mockResolvedValueOnce("ok");
    const result = await withRetry("openai", fn, { maxRetries: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient failures", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthenticationError("bad", "openai"));
    await expect(withRetry("openai", fn, { maxRetries: 3 })).rejects.toThrow(
      AuthenticationError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkError("down", "local"));
    await expect(withRetry("local", fn, { maxRetries: 1 })).rejects.toThrow(
      NetworkError
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("MockProvider", () => {
  it("plays scripted responses in order then falls back to the handler", async () => {
    const provider = new MockProvider({
      scripts: ["first"],
      handler: () => "fallback",
    });
    expect((await provider.chat([])).content).toBe("first");
    expect((await provider.chat([])).content).toBe("fallback");
  });

  it("streams content then a terminal frame with usage", async () => {
    const provider = new MockProvider({
      handler: () => ({
        content: "hello world, this is streamed",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      }),
    });
    const frames = [];
    for await (const frame of provider.stream([])) {
      frames.push(frame);
    }
    const last = frames[frames.length - 1];
    expect(last?.done).toBe(true);
    expect(last?.usage?.totalTokens).toBe(3);
    expect(frames.map((f) => f.content).join("")).toBe("hello world, this is streamed");
  });

  it("honors abort signals", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new MockProvider({ handler: () => "nope" });
    await expect(
      provider.chat([], { signal: controller.signal })
    ).rejects.toThrow();
  });
});

describe("LocalProvider", () => {
  it("survives NDJSON frames split across network chunks", async () => {
    const frame = JSON.stringify({ message: { content: "hello" }, done: false }) + "\n";
    const mid = Math.floor(frame.length / 2);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frame.slice(0, mid)));
        controller.enqueue(encoder.encode(frame.slice(mid)));
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ message: { content: "" }, done: true, eval_count: 5, prompt_eval_count: 7 }) +
              "\n"
          )
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200 })
    );

    const provider = new LocalProvider({
      baseUrl: "http://ollama.test",
      fetch: fetchMock,
    });
    const frames = [];
    for await (const frame of provider.stream([{ role: "user", content: "hi" }])) {
      frames.push(frame);
    }

    const content = frames
      .filter((f) => !f.done)
      .map((f) => f.content)
      .join("");
    expect(content).toBe("hello");
    const last = frames[frames.length - 1];
    expect(last?.done).toBe(true);
    expect(last?.usage?.totalTokens).toBe(12);
  });

  it("throws a typed error on HTTP failures instead of parsing the body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>404</html>", { status: 404 }));
    const provider = new LocalProvider({
      baseUrl: "http://ollama.test",
      fetch: fetchMock,
    });
    await expect(provider.chat([])).rejects.toThrow(LLMError);
  });

  it("normalizes tool calls from chat responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ function: { name: "calculator", arguments: { expression: "1+1" } } }],
          },
          done: true,
          done_reason: "tool_calls",
        }),
        { status: 200 }
      )
    );
    const provider = new LocalProvider({
      baseUrl: "http://ollama.test",
      fetch: fetchMock,
    });
    const response = await provider.chat([]);
    expect(response.toolCalls?.[0]?.name).toBe("calculator");
    expect(response.toolCalls?.[0]?.arguments).toBe('{"expression":"1+1"}');
    expect(response.finishReason).toBe("tool_calls");
  });
});
