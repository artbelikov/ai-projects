import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z, ZodError } from "zod";
import {
  AuthenticationError,
  LLMError,
  RateLimitError,
} from "@ai-portfolio/llm-integrations";
import { EmptyStoreError, RAGError } from "@ai-portfolio/rag-core";
import { llmRoutes } from "./routes/llm.js";
import { ragRoutes } from "./routes/rag.js";
import { agentRoutes } from "./routes/agents.js";

const VERSION = "0.1.0";

interface ErrorPayload {
  statusCode: number;
  error: string;
  message: string;
  code: string;
}

function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return {
      statusCode: 400,
      error: "Bad Request",
      message: issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "Validation failed",
      code: "VALIDATION_ERROR",
    };
  }

  if (err instanceof EmptyStoreError) {
    return {
      statusCode: 400,
      error: "Bad Request",
      message: err.message,
      code: "EMPTY_STORE",
    };
  }

  if (err instanceof AuthenticationError) {
    return {
      statusCode: 401,
      error: "Unauthorized",
      message: "The configured provider credentials were rejected",
      code: "AUTH_ERROR",
    };
  }

  if (err instanceof RateLimitError) {
    return {
      statusCode: 429,
      error: "Too Many Requests",
      message: "Upstream provider rate limit hit, retry later",
      code: "RATE_LIMITED",
    };
  }

  if (err instanceof LLMError || err instanceof RAGError) {
    return {
      statusCode: 502,
      error: "Bad Gateway",
      message: err.message.slice(0, 300),
      code: "UPSTREAM_ERROR",
    };
  }

  const candidate = err as { statusCode?: number; code?: string; message?: string; name?: string } | null;
  const statusCode = candidate?.statusCode ?? 500;

  if (statusCode === 429) {
    return {
      statusCode: 429,
      error: "Too Many Requests",
      message: "Too many requests, slow down",
      code: "RATE_LIMITED",
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      statusCode,
      error: candidate?.name ?? "Bad Request",
      message: candidate?.message ?? "Invalid request",
      code: "VALIDATION_ERROR",
    };
  }

  return {
    statusCode: 500,
    error: "Internal Server Error",
    message: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };
}

function parseOrigins(): string[] | true {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return ["http://localhost:3000"];
  if (raw === "*") return true;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(helmet, { contentSecurityPolicy: false });
  void app.register(cors, {
    origin: parseOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
  });
  void app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
  });

  void app.register(swagger, {
    openapi: {
      info: {
        title: "AI Portfolio API",
        description:
          "Unified API for LLM chat, RAG retrieval, and autonomous agents. Set provider to 'mock' for keyless demos.",
        version: VERSION,
      },
      tags: [
        { name: "llm", description: "Multi-provider LLM chat" },
        { name: "rag", description: "Retrieval-augmented generation" },
        { name: "agents", description: "ReAct and multi-agent orchestration" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  void app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((err, req, reply) => {
    const payload = toErrorPayload(err);
    if (payload.statusCode >= 500) {
      req.log.error({ err }, "request failed");
    } else {
      req.log.warn({ err: { name: err.name, message: err.message } }, "request rejected");
    }
    void reply.status(payload.statusCode).send(payload);
  });

  app.get(
    "/health",
    {
      schema: {
        description: "Health check",
        tags: ["llm"],
        response: {
          200: z.object({
            status: z.literal("ok"),
            version: z.string(),
          }),
        },
      },
    },
    async () => ({ status: "ok" as const, version: VERSION })
  );

  void app.register(llmRoutes, { prefix: "/llm" });
  void app.register(ragRoutes, { prefix: "/rag" });
  void app.register(agentRoutes, { prefix: "/agents" });

  return app;
}
