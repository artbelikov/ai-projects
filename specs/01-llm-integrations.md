# Package Spec: `@ai-portfolio/llm-integrations`

## Purpose
Provide a unified, provider-agnostic interface for interacting with large language models. This is the foundational layer that all other packages depend on.

## Public API Surface

### Types
```typescript
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

interface StreamingChunk {
  content: string;
  done: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### Abstract Base
```typescript
abstract class BaseLLMProvider {
  abstract chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  abstract stream(messages: Message[], options?: LLMOptions): AsyncGenerator<StreamingChunk>;
  abstract supportsTools(): boolean;
}
```

### Concrete Implementations
1. **OpenAIProvider** — uses `openai` SDK, supports tools, streaming
2. **AnthropicProvider** — uses `@anthropic-ai/sdk`, supports streaming
3. **LocalProvider** — calls Ollama-compatible local server via fetch

### Factory
```typescript
class LLMFactory {
  static create(provider: "openai" | "anthropic" | "local", apiKey?: string): BaseLLMProvider;
}
```

## Design Decisions
- **Streaming as first-class**: All providers must implement streaming; non-streaming is a convenience wrapper
- **Tool calls unified**: OpenAI's `tool_calls` and Anthropic's `tool_use` are normalized to a single `ToolCall` shape
- **No LangChain dependency**: Demonstrates ability to build LLM abstractions from scratch

## Error Handling
- Network errors bubble up with provider context
- Invalid API keys throw `AuthenticationError`
- Rate limits throw `RateLimitError` with retry-after hint

## Testing Strategy
- Unit tests with mocked fetch/SDK responses
- Snapshot tests for message formatting per provider
- Streaming tested via async generators

## Dependencies
- `openai`
- `@anthropic-ai/sdk`
- `zod` (for future structured output validation)
