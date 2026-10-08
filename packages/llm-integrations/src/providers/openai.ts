import OpenAI from "openai";
import {
  BaseLLMProvider,
  type LLMOptions,
  type LLMResponse,
  type Message,
  type ProviderConfig,
  type StreamingChunk,
  type Stream,
  type ToolCall,
  type TokenUsage,
} from "../types.js";
import { withRetry, toLLMError } from "../errors.js";
import { toOpenAIFetch } from "./sdk-fetch.js";
import {
  toOpenAIMessages,
  toOpenAITools,
  fromOpenAIToolCalls,
  fromOpenAIFinishReason,
  estimateTokens,
} from "./openai-mapping.js";

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey ?? "missing-key",
      baseURL: config.baseUrl,
      ...(config.fetch ? { fetch: toOpenAIFetch(config.fetch) } : {}),
      maxRetries: 0,
    });
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    return withRetry(
      this.name,
      async () => {
        const response = await this.client.chat.completions.create(
          {
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            messages: toOpenAIMessages(messages),
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens,
            top_p: options.topP,
            stop: options.stopSequences,
            tools: toOpenAITools(options.tools),
          },
          { signal: options.signal }
        );

        const choice = response.choices[0];
        if (!choice) return { content: "" };

        return {
          content: choice.message.content ?? "",
          toolCalls: fromOpenAIToolCalls(choice.message.tool_calls),
          finishReason: fromOpenAIFinishReason(choice.finish_reason),
          usage: response.usage
            ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
        };
      },
      { maxRetries: this.config.maxRetries, signal: options.signal }
    ).catch((err: unknown) => {
      throw toLLMError(err, this.name);
    });
  }

  async *stream(messages: Message[], options: LLMOptions = {}): Stream {
    const toolCalls = new Map<number, ToolCall>();
    let finishReason: StreamingChunk["finishReason"];
    let usage: TokenUsage | undefined;

    try {
      const stream = await withRetry(
        this.name,
        () =>
          this.client.chat.completions.create(
            {
              model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
              messages: toOpenAIMessages(messages),
              temperature: options.temperature ?? 0.7,
              max_tokens: options.maxTokens,
              top_p: options.topP,
              stop: options.stopSequences,
              tools: toOpenAITools(options.tools),
              stream: true,
              stream_options: { include_usage: true },
            },
            { signal: options.signal }
          ),
        { maxRetries: this.config.maxRetries, signal: options.signal }
      );

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = fromOpenAIFinishReason(choice.finish_reason);
        }

        const delta = choice.delta;
        if (delta?.content) {
          yield { content: delta.content, done: false };
        }

        for (const callDelta of delta?.tool_calls ?? []) {
          const index = callDelta.index ?? 0;
          const existing = toolCalls.get(index);
          toolCalls.set(index, {
            id: callDelta.id ?? existing?.id ?? `call_${index}`,
            name:
              callDelta.function?.name ?? existing?.name ?? "",
            arguments:
              (existing?.arguments ?? "") + (callDelta.function?.arguments ?? ""),
          });
        }
      }
    } catch (err) {
      throw toLLMError(err, this.name);
    }

    const promptText = messages.map((m) => m.content).join("\n");
    const calls = toolCalls.size
      ? [...toolCalls.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, call]) => call)
      : undefined;

    yield {
      content: "",
      done: true,
      toolCalls: calls,
      finishReason: finishReason ?? (calls ? "tool_calls" : "stop"),
      usage: usage ?? {
        promptTokens: estimateTokens(promptText),
        completionTokens: 0,
        totalTokens: estimateTokens(promptText),
      },
    };
  }

  supportsTools(): boolean {
    return true;
  }
}
