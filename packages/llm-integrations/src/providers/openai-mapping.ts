import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  Message,
  ToolDefinition,
  ToolCall,
  FinishReason,
} from "../types.js";

export function toOpenAITools(
  tools: ToolDefinition[] | undefined
): ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toOpenAIMessages(
  messages: Message[]
): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "system") {
      return { role: "system" as const, content: message.content };
    }
    if (message.role === "user") {
      return { role: "user" as const, content: message.content };
    }
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: message.toolCallId ?? "",
        content: message.content,
      };
    }
    return {
      role: "assistant" as const,
      content: message.content === "" ? null : message.content,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  });
}

export function fromOpenAIToolCalls(
  calls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined
): ToolCall[] | undefined {
  if (!calls?.length) return undefined;
  return calls.map((call) => {
    if (call.type === "function") {
      return {
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      };
    }
    return { id: call.id, name: "unknown", arguments: "{}" };
  });
}

export function fromOpenAIFinishReason(
  reason: string | null | undefined
): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    default:
      return "unknown";
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
