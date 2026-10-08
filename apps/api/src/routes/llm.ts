import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { llmService } from "../services/llm-service.js";
import { openSse } from "../sse.js";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().max(32000),
  toolCallId: z.string().optional(),
  name: z.string().optional(),
});

const LLMOptionsSchema = z
  .object({
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(32000).optional(),
    topP: z.number().min(0).max(1).optional(),
    stopSequences: z.array(z.string().max(100)).max(8).optional(),
  })
  .strict();

const ChatBodySchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "local", "mock"]).optional(),
    messages: z.array(MessageSchema).min(1).max(50),
    options: LLMOptionsSchema.optional(),
  })
  .strict();

const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

const ErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string(),
});

export const llmRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/chat",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "Chat with an LLM provider",
        tags: ["llm"],
        body: ChatBodySchema,
        response: {
          200: z.object({
            content: z.string(),
            finishReason: z.string().optional(),
            usage: UsageSchema.optional(),
          }),
          400: ErrorSchema,
          429: ErrorSchema,
          502: ErrorSchema,
        },
      },
    },
    async (req) => {
      const { provider, messages, options } = req.body;
      const type = llmService.resolve(provider);
      const llm = llmService.getProvider(type);
      const response = await llm.chat(messages, options);
      return {
        content: response.content,
        finishReason: response.finishReason,
        usage: response.usage,
      };
    }
  );

  app.post(
    "/chat/stream",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "Stream a chat completion via SSE",
        tags: ["llm"],
        body: ChatBodySchema,
      },
    },
    async (req, reply) => {
      const { provider, messages, options } = req.body;
      const type = llmService.resolve(provider);
      const llm = llmService.getProvider(type);
      const sse = openSse(req, reply);

      try {
        for await (const chunk of llm.stream(messages, {
          ...options,
          signal: sse.signal,
        })) {
          if (sse.disconnected) break;
          sse.send(chunk);
        }
        sse.finish();
      } catch (err) {
        sse.fail(err);
      }
    }
  );

  app.get(
    "/providers",
    {
      schema: {
        description: "List LLM providers available in this deployment",
        tags: ["llm"],
        response: {
          200: z.object({ providers: z.array(z.string()) }),
        },
      },
    },
    async () => ({ providers: llmService.getAvailableProviders() })
  );
};
