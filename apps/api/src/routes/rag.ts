import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ragService } from "../services/rag-service.js";
import { openSse } from "../sse.js";

const IngestBodySchema = z
  .object({
    documents: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            content: z.string().min(1).max(50000),
            metadata: z.record(z.unknown()).optional(),
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();

const QueryBodySchema = z
  .object({
    question: z.string().min(1).max(4000),
    topK: z.number().min(1).max(20).optional(),
    minScore: z.number().min(-1).max(1).optional(),
  })
  .strict();

const SourceSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  content: z.string(),
  score: z.number(),
  metadata: z.record(z.unknown()),
});

const ErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string(),
});

export const ragRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/ingest",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        description: "Ingest documents into the RAG pipeline",
        tags: ["rag"],
        body: IngestBodySchema,
        response: {
          200: z.object({
            documents: z.number(),
            chunks: z.number(),
            embedded: z.number(),
            failed: z.number(),
          }),
          400: ErrorSchema,
          429: ErrorSchema,
          502: ErrorSchema,
        },
      },
    },
    async (req) => {
      const { documents } = req.body;
      const pipeline = ragService.getPipeline();
      return await pipeline.ingest(documents);
    }
  );

  app.post(
    "/query",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "Query the RAG pipeline and receive an answer with sources",
        tags: ["rag"],
        body: QueryBodySchema,
        response: {
          200: z.object({
            answer: z.string(),
            sources: z.array(SourceSchema),
            usage: z
              .object({
                promptTokens: z.number(),
                completionTokens: z.number(),
                totalTokens: z.number(),
              })
              .optional(),
          }),
          400: ErrorSchema,
          429: ErrorSchema,
          502: ErrorSchema,
        },
      },
    },
    async (req) => {
      const { question, topK, minScore } = req.body;
      const pipeline = ragService.getPipeline();
      const result = await pipeline.query(question, { topK, minScore });
      return result;
    }
  );

  app.post(
    "/query/stream",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "Stream a RAG answer via SSE (sources first, then tokens)",
        tags: ["rag"],
        body: QueryBodySchema,
      },
    },
    async (req, reply) => {
      const { question, topK, minScore } = req.body;
      const pipeline = ragService.getPipeline();
      const sse = openSse(req, reply);

      try {
        for await (const event of pipeline.streamQuery(question, {
          topK,
          minScore,
          llm: { signal: sse.signal },
        })) {
          if (sse.disconnected) break;
          sse.send(event);
        }
        sse.finish();
      } catch (err) {
        sse.fail(err);
      }
    }
  );
};
