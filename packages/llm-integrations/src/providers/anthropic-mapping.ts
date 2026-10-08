import type Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ToolDefinition,
  ToolCall,
  FinishReason,
} from "../types.js";

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ToolUseBlockParam
  | Anthropic.ToolResultBlockParam;

export function toAnthropicSystem(messages: Message[]): string | undefined {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  if (!systemParts.length) return undefined;
  return systemParts.join("\n\n");
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: raw };
  } catch {
    return { value: raw };
  }
}

export function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: message.toolCallId ?? "",
        content: message.content,
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      if (message.content) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: parseToolArguments(call.arguments),
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    out.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    });
  }

  return out;
}

export function toAnthropicTools(
  tools: ToolDefinition[] | undefined
): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

export function fromAnthropicContent(content: Anthropic.ContentBlock[]): {
  text: string;
  toolCalls?: ToolCall[];
} {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
  }

  return {
    text: textParts.join(""),
    toolCalls: toolCalls.length ? toolCalls : undefined,
  };
}

export function fromAnthropicStopReason(
  reason: string | null | undefined
): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return "unknown";
  }
}
