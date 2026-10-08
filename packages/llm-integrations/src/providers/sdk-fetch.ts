import type { Fetch as OpenAIFetch } from "openai/core.js";
import type { Fetch as AnthropicFetch } from "@anthropic-ai/sdk/core.js";
import type { FetchLike } from "../types.js";

export function toOpenAIFetch(fn: FetchLike): OpenAIFetch {
  return ((url: unknown, init?: unknown) =>
    fn(url as string | URL | Request, init as RequestInit | undefined)) as unknown as OpenAIFetch;
}

export function toAnthropicFetch(fn: FetchLike): AnthropicFetch {
  return ((url: unknown, init?: unknown) =>
    fn(url as string | URL | Request, init as RequestInit | undefined)) as unknown as AnthropicFetch;
}
