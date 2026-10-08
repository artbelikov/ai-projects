import {
  LLMFactory,
  MockProvider,
  type BaseLLMProvider,
  type ProviderConfig,
  type ProviderType,
} from "@ai-portfolio/llm-integrations";
import { demoMockHandler } from "./demo-mock.js";

const KEY_ENV: Record<Exclude<ProviderType, "mock">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  local: "LOCAL_LLM_URL",
};

class LLMService {
  private providers = new Map<string, BaseLLMProvider>();

  hasKey(type: ProviderType): boolean {
    if (type === "mock") return true;
    return Boolean(process.env[KEY_ENV[type]]);
  }

  resolve(preference?: string): ProviderType {
    const wanted = preference?.trim().toLowerCase();
    if (
      wanted === "openai" ||
      wanted === "anthropic" ||
      wanted === "local" ||
      wanted === "mock"
    ) {
      return wanted;
    }
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    return "mock";
  }

  getProvider(type: ProviderType, config: ProviderConfig = {}): BaseLLMProvider {
    const cacheKey = `${type}:${config.baseUrl ?? ""}:${config.defaultModel ?? ""}`;
    const cached = this.providers.get(cacheKey);
    if (cached) return cached;

    const provider =
      type === "mock"
        ? new MockProvider({ handler: demoMockHandler, ...config })
        : LLMFactory.create(type, this.buildConfig(type, config));

    this.providers.set(cacheKey, provider);
    return provider;
  }

  getAvailableProviders(): ProviderType[] {
    const available: ProviderType[] = [];
    if (process.env.OPENAI_API_KEY) available.push("openai");
    if (process.env.ANTHROPIC_API_KEY) available.push("anthropic");
    available.push("local", "mock");
    return available;
  }

  private buildConfig(type: ProviderType, config: ProviderConfig): ProviderConfig {
    if (type === "local") {
      return {
        baseUrl: config.baseUrl ?? process.env.LOCAL_LLM_URL ?? "http://localhost:11434",
        ...config,
      };
    }
    return {
      apiKey: config.apiKey ?? process.env[KEY_ENV[type as Exclude<ProviderType, "mock">]],
      ...config,
    };
  }
}

export const llmService = new LLMService();
