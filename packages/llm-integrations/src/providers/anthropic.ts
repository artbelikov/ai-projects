import Anthropic from "@anthropic-ai/sdk";
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
import { toAnthropicFetch } from "./sdk-fetch.js";
import {
  toAnthropicSystem,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicContent,
  fromAnthropicStopReason,
} from "./anthropic-mapping.js";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey ?? "missing-key",
      baseURL: config.baseUrl,
      ...(config.fetch ? { fetch: toAnthropicFetch(config.fetch) } : {}),
      maxRetries: 0,
    });
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    return withRetry(
      this.name,
      async () => {
        const system = toAnthropicSystem(messages);
        const response = await this.client.messages.create(
          {
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.7,
            ...(system !== undefined ? { system } : {}),
            ...(options.topP !== undefined ? { top_p: options.topP } : {}),
            ...(options.stopSequences?.length
              ? { stop_sequences: options.stopSequences }
              : {}),
            messages: toAnthropicMessages(messages),
            tools: toAnthropicTools(options.tools),
          },
          { signal: options.signal }
        );

        const { text, toolCalls } = fromAnthropicContent(response.content);

        return {
          content: text,
          toolCalls,
          finishReason: fromAnthropicStopReason(response.stop_reason),
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        };
      },
      { maxRetries: this.config.maxRetries, signal: options.signal }
    ).catch((err: unknown) => {
      throw toLLMError(err, this.name);
    });
  }

  async *stream(messages: Message[], options: LLMOptions = {}): Stream {
    const toolCalls = new Map<number, ToolCall>();
    const textParts: string[] = [];
    let finishReason: StreamingChunk["finishReason"];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const system = toAnthropicSystem(messages);
      const stream = await withRetry(
        this.name,
        () =>
          this.client.messages.create(
            {
              model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
              max_tokens: options.maxTokens ?? 4096,
              temperature: options.temperature ?? 0.7,
              ...(system !== undefined ? { system } : {}),
              ...(options.topP !== undefined ? { top_p: options.topP } : {}),
              ...(options.stopSequences?.length
                ? { stop_sequences: options.stopSequences }
                : {}),
              messages: toAnthropicMessages(messages),
              tools: toAnthropicTools(options.tools),
              stream: true,
            },
            { signal: options.signal }
          ),
        { maxRetries: this.config.maxRetries, signal: options.signal }
      );

      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
        } else if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
          finishReason = fromAnthropicStopReason(event.delta.stop_reason);
        } else if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            toolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: "",
            });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            textParts.push(delta.text);
            yield { content: delta.text, done: false };
          } else if (delta.type === "input_json_delta") {
            const existing = toolCalls.get(event.index);
            if (existing) {
              existing.arguments += delta.partial_json;
            }
          }
        }
      }
    } catch (err) {
      throw toLLMError(err, this.name);
    }

    const calls = toolCalls.size
      ? [...toolCalls.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, call]) => call)
      : undefined;

    const usage: TokenUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };

    yield {
      content: "",
      done: true,
      toolCalls: calls,
      finishReason: finishReason ?? (calls ? "tool_calls" : "stop"),
      usage,
    };
  }

  supportsTools(): boolean {
    return true;
  }
}
