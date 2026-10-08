export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  toolCallId?: string;
  name?: string;
  toolCalls?: ToolCall[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "unknown";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface StreamingChunk {
  content: string;
  done: boolean;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: globalThis.RequestInit
) => Promise<globalThis.Response>;

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: FetchLike;
  maxRetries?: number;
}

export type Stream = AsyncGenerator<StreamingChunk>;

export abstract class BaseLLMProvider {
  constructor(protected config: ProviderConfig = {}) {}

  abstract chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;

  abstract stream(messages: Message[], options?: LLMOptions): Stream;

  abstract supportsTools(): boolean;

  abstract readonly name: string;
}
