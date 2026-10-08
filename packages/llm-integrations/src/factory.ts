import { BaseLLMProvider, type ProviderConfig } from "./types.js";
import { InvalidRequestError, AuthenticationError } from "./errors.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { LocalProvider } from "./providers/local.js";
import { MockProvider } from "./providers/mock.js";

export type ProviderType = "openai" | "anthropic" | "local" | "mock";

const PROVIDERS: Record<
  ProviderType,
  new (config: ProviderConfig) => BaseLLMProvider
> = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  local: LocalProvider,
  mock: MockProvider,
};

export class LLMFactory {
  static create(provider: ProviderType, config: ProviderConfig = {}): BaseLLMProvider {
    const Ctor = PROVIDERS[provider];
    if (!Ctor) {
      throw new InvalidRequestError(`Unknown provider: ${String(provider)}`, "factory");
    }

    if (provider === "openai" && !config.apiKey) {
      throw new AuthenticationError("OpenAI API key required", provider);
    }
    if (provider === "anthropic" && !config.apiKey) {
      throw new AuthenticationError("Anthropic API key required", provider);
    }

    return new Ctor(config);
  }

  static available(): ProviderType[] {
    return Object.keys(PROVIDERS) as ProviderType[];
  }
}
