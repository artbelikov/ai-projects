import { describe, it, expect } from "vitest";
import type { Message } from "../src/types.js";
import {
  toOpenAIMessages,
  toOpenAITools,
  fromOpenAIToolCalls,
  fromOpenAIFinishReason,
} from "../src/providers/openai-mapping.js";
import {
  toAnthropicSystem,
  toAnthropicMessages,
  toAnthropicTools,
  fromAnthropicContent,
  fromAnthropicStopReason,
} from "../src/providers/anthropic-mapping.js";

describe("openai mapping", () => {
  it("round-trips assistant tool calls and tool results", () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "do math" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "calculator", arguments: '{"expression":"1+1"}' }],
      },
      { role: "tool", content: "2", toolCallId: "call_1" },
    ];
    const mapped = toOpenAIMessages(messages);
    expect(mapped[0]).toEqual({ role: "system", content: "sys" });
    expect(mapped[2]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "calculator", arguments: '{"expression":"1+1"}' },
        },
      ],
    });
    expect(mapped[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "2",
    });
  });

  it("maps tools and finish reasons", () => {
    const tools = toOpenAITools([
      {
        name: "calculator",
        description: "math",
        parameters: { type: "object" },
      },
    ]);
    expect(tools?.[0]?.type).toBe("function");
    expect(toOpenAITools([])).toBeUndefined();
    expect(fromOpenAIFinishReason("tool_calls")).toBe("tool_calls");
    expect(fromOpenAIFinishReason("stop")).toBe("stop");
    expect(fromOpenAIFinishReason(null)).toBe("unknown");
  });

  it("normalizes tool call shapes", () => {
    const calls = fromOpenAIToolCalls([
      {
        id: "c1",
        type: "function",
        function: { name: "f", arguments: "{}" },
      },
    ]);
    expect(calls?.[0]).toEqual({ id: "c1", name: "f", arguments: "{}" });
    expect(fromOpenAIToolCalls(undefined)).toBeUndefined();
  });
});

describe("anthropic mapping", () => {
  it("extracts and joins system messages", () => {
    const messages: Message[] = [
      { role: "system", content: "one" },
      { role: "system", content: "two" },
      { role: "user", content: "hi" },
    ];
    expect(toAnthropicSystem(messages)).toBe("one\n\ntwo");
    expect(toAnthropicSystem([{ role: "user", content: "hi" }])).toBeUndefined();
  });

  it("merges consecutive tool results into one user message", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a", name: "x", arguments: '{"q":1}' },
          { id: "b", name: "y", arguments: '{"q":2}' },
        ],
      },
      { role: "tool", content: "r1", toolCallId: "a" },
      { role: "tool", content: "r2", toolCallId: "b" },
    ];
    const mapped = toAnthropicMessages(messages);
    expect(mapped).toHaveLength(2);
    const assistant = mapped[0];
    expect(assistant?.role).toBe("assistant");
    expect(Array.isArray(assistant?.content)).toBe(true);
    const user = mapped[1];
    expect(user?.role).toBe("user");
    expect(Array.isArray(user?.content) && user.content).toHaveLength(2);
  });

  it("falls back to a value wrapper for non-object tool arguments", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "a", name: "x", arguments: "not json" }],
      },
    ];
    const mapped = toAnthropicMessages(messages);
    const blocks = mapped[0]?.content;
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks?.[0]).toMatchObject({
      type: "tool_use",
      input: { value: "not json" },
    });
  });

  it("extracts text and tool_use from content blocks", () => {
    const result = fromAnthropicContent([
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
      {
        type: "tool_use",
        id: "t1",
        name: "calc",
        input: { expression: "1+1" },
      },
    ] as never);
    expect(result.text).toBe("hello world");
    expect(result.toolCalls?.[0]?.name).toBe("calc");
    expect(result.toolCalls?.[0]?.arguments).toBe('{"expression":"1+1"}');
  });

  it("does not silently drop tool_use as the first block", () => {
    const result = fromAnthropicContent([
      {
        type: "tool_use",
        id: "t1",
        name: "calc",
        input: {},
      },
    ] as never);
    expect(result.text).toBe("");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("maps stop reasons and tools", () => {
    expect(fromAnthropicStopReason("tool_use")).toBe("tool_calls");
    expect(fromAnthropicStopReason("end_turn")).toBe("stop");
    expect(fromAnthropicStopReason(undefined)).toBe("unknown");
    const tools = toAnthropicTools([
      { name: "x", description: "d", parameters: { type: "object" } },
    ]);
    expect(tools?.[0]?.name).toBe("x");
  });
});
