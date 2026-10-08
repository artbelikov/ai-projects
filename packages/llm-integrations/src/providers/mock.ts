import {
  BaseLLMProvider,
  type LLMOptions,
  type LLMResponse,
  type Message,
  type ProviderConfig,
  type Stream,
} from "../types.js";

export type MockHandler = (
  messages: Message[],
  options: LLMOptions
) => LLMResponse | string | Promise<LLMResponse | string>;

export interface MockProviderConfig extends ProviderConfig {
  handler?: MockHandler;
  scripts?: Array<LLMResponse | string>;
  latencyMs?: number;
}

function normalize(response: LLMResponse | string): LLMResponse {
  if (typeof response === "string") {
    return {
      content: response,
      finishReason: "stop",
      usage: {
        promptTokens: 0,
        completionTokens: Math.ceil(response.length / 4),
        totalTokens: Math.ceil(response.length / 4),
      },
    };
  }
  return response;
}

export class MockProvider extends BaseLLMProvider {
  readonly name = "mock";
  private scripts: Array<LLMResponse | string>;
  private handler: MockHandler;
  private latencyMs: number;

  constructor(config: MockProviderConfig = {}) {
    super(config);
    this.scripts = [...(config.scripts ?? [])];
    this.handler = config.handler ?? (() => "This is a mock response.");
    this.latencyMs = config.latencyMs ?? 0;
  }

  private async next(messages: Message[], options: LLMOptions): Promise<LLMResponse> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    const scripted = this.scripts.shift();
    if (scripted !== undefined) return normalize(scripted);
    return normalize(await this.handler(messages, options));
  }

  async chat(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("Aborted");
    return this.next(messages, options);
  }

  async *stream(messages: Message[], options: LLMOptions = {}): Stream {
    const response = await this.next(messages, options);
    const content = response.content;
    const step = 24;

    for (let i = 0; i < content.length; i += step) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error("Aborted");
      }
      yield { content: content.slice(i, i + step), done: false };
    }

    yield {
      content: "",
      done: true,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
      usage: response.usage,
    };
  }

  supportsTools(): boolean {
    return true;
  }

  pushScript(...responses: Array<LLMResponse | string>): void {
    this.scripts.push(...responses);
  }
}
