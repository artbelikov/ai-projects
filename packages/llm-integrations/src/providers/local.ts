import {
  BaseLLMProvider,
  type LLMOptions,
  type LLMResponse,
  type Message,
  type ProviderConfig,
  type StreamingChunk,
  type Stream,
  type ToolCall,
  type ToolDefinition,
  type FinishReason,
} from "../types.js";
import {
  errorFromResponse,
  toLLMError,
  withRetry,
  NetworkError,
} from "../errors.js";

const DEFAULT_MODEL = "llama3";
const DEFAULT_BASE_URL = "http://localhost:11434";

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
}

interface OllamaResponse {
  message?: OllamaMessage;
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

function toOllamaMessages(messages: Message[]): OllamaMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", content: message.content };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          function: {
            name: call.name,
            arguments: safeParse(call.arguments),
          },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function fromOllamaToolCalls(
  calls: OllamaMessage["tool_calls"]
): ToolCall[] | undefined {
  if (!calls?.length) return undefined;
  return calls.map((call, index) => ({
    id: `call_${index}`,
    name: call.function.name,
    arguments:
      typeof call.function.arguments === "string"
        ? call.function.arguments
        : JSON.stringify(call.function.arguments ?? {}),
  }));
}

function toOllamaTools(
  tools: ToolDefinition[] | undefined
): Record<string, unknown>[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function mapOllamaStopReason(reason: string | undefined, hasTools: boolean): FinishReason {
  if (hasTools) return "tool_calls";
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  return "unknown";
}

export class LocalProvider extends BaseLLMProvider {
  readonly name = "local";
  private baseUrl: string;
  private fetchImpl: typeof globalThis.fetch;

  constructor(config: ProviderConfig | string = {}) {
    const normalized: ProviderConfig =
      typeof config === "string" ? { baseUrl: config } : config;
    super(normalized);
    this.baseUrl = normalized.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = normalized.fetch ?? globalThis.fetch;
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    return withRetry(
      this.name,
      async () => {
        const body = {
          model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
          messages: toOllamaMessages(messages),
          stream: false,
          ...(options.tools?.length ? { tools: toOllamaTools(options.tools) } : {}),
          options: {
            temperature: options.temperature ?? 0.7,
            ...(options.topP !== undefined ? { top_p: options.topP } : {}),
            ...(options.maxTokens !== undefined
              ? { num_predict: options.maxTokens }
              : {}),
            ...(options.stopSequences?.length
              ? { stop: options.stopSequences }
              : {}),
          },
        };

        const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: options.signal,
        });

        if (!response.ok) {
          throw await errorFromResponse(response, this.name);
        }

        const data = (await response.json()) as OllamaResponse;
        const toolCalls = fromOllamaToolCalls(data.message?.tool_calls);

        return {
          content: data.message?.content ?? "",
          toolCalls,
          finishReason: mapOllamaStopReason(data.done_reason, Boolean(toolCalls)),
          usage: {
            promptTokens: data.prompt_eval_count ?? 0,
            completionTokens: data.eval_count ?? 0,
            totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
          },
        };
      },
      { maxRetries: this.config.maxRetries, signal: options.signal }
    ).catch((err: unknown) => {
      throw toLLMError(err, this.name);
    });
  }

  async *stream(messages: Message[], options: LLMOptions = {}): Stream {
    let response: Response;
    try {
      response = await withRetry(
        this.name,
        async () => {
          const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
              messages: toOllamaMessages(messages),
              stream: true,
              ...(options.tools?.length
                ? { tools: toOllamaTools(options.tools) }
                : {}),
              options: {
                temperature: options.temperature ?? 0.7,
                ...(options.topP !== undefined ? { top_p: options.topP } : {}),
                ...(options.maxTokens !== undefined
                  ? { num_predict: options.maxTokens }
                  : {}),
                ...(options.stopSequences?.length
                  ? { stop: options.stopSequences }
                  : {}),
              },
            }),
            signal: options.signal,
          });

          if (!res.ok) {
            throw await errorFromResponse(res, this.name);
          }
          return res;
        },
        { maxRetries: this.config.maxRetries, signal: options.signal }
      );
    } catch (err) {
      throw toLLMError(err, this.name);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError(`${this.name} returned an empty body`, this.name);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason: StreamingChunk["finishReason"];
    let promptTokens = 0;
    let completionTokens = 0;
    const toolCalls = new Map<number, ToolCall>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let data: OllamaResponse;
          try {
            data = JSON.parse(trimmed) as OllamaResponse;
          } catch {
            continue;
          }

          const calls = fromOllamaToolCalls(data.message?.tool_calls);
          if (calls) {
            for (const call of calls) {
              toolCalls.set(toolCalls.size, call);
            }
          }

          if (data.message?.content) {
            yield { content: data.message.content, done: false };
          }

          if (data.prompt_eval_count !== undefined) promptTokens = data.prompt_eval_count;
          if (data.eval_count !== undefined) completionTokens = data.eval_count;

          if (data.done) {
            finishReason = mapOllamaStopReason(data.done_reason, toolCalls.size > 0);
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim()) as OllamaResponse;
          if (data.message?.content) {
            yield { content: data.message.content, done: false };
          }
        } catch {
          throw new NetworkError(
            `${this.name} stream ended with an incomplete frame`,
            this.name
          );
        }
      }
    } finally {
      reader.releaseLock();
    }

    const calls = toolCalls.size
      ? [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, c]) => c)
      : undefined;

    yield {
      content: "",
      done: true,
      toolCalls: calls,
      finishReason: finishReason ?? (calls ? "tool_calls" : "stop"),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  supportsTools(): boolean {
    return true;
  }
}
