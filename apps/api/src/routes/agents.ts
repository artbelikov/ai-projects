import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { agentService } from "../services/agent-service.js";

const ReActBodySchema = z
  .object({
    task: z.string().min(1).max(4000),
    maxIterations: z.number().min(1).max(20).optional(),
  })
  .strict();

const SupervisorBodySchema = z
  .object({
    task: z.string().min(1).max(4000),
    maxHops: z.number().min(1).max(4).optional(),
  })
  .strict();

const ErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string(),
});

const ReActResponseSchema = z.object({
  status: z.enum(["success", "max_iterations", "parse_error", "error"]),
  answer: z.string(),
  steps: z.array(
    z.object({
      iteration: z.number(),
      thought: z.string(),
      action: z
        .object({ tool: z.string(), input: z.string() })
        .optional(),
      observation: z.string().optional(),
      finalAnswer: z.string().optional(),
    })
  ),
  tokenUsage: z.number(),
  error: z.string().optional(),
});

const SupervisorResponseSchema = z.object({
  status: z.enum(["success", "error"]),
  result: z.string(),
  delegationChain: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      task: z.string(),
      result: z.string(),
      error: z.string().optional(),
    })
  ),
  tokenUsage: z.number(),
  error: z.string().optional(),
});

export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/react",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        description: "Run a ReAct agent on a task",
        tags: ["agents"],
        body: ReActBodySchema,
        response: {
          200: ReActResponseSchema,
          400: ErrorSchema,
          429: ErrorSchema,
          502: ErrorSchema,
        },
      },
    },
    async (req) => {
      const { task, maxIterations } = req.body;
      const agent = agentService.getReActAgent(maxIterations);
      return await agent.run(task);
    }
  );

  app.post(
    "/supervisor",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        description: "Run the multi-agent supervisor on a task",
        tags: ["agents"],
        body: SupervisorBodySchema,
        response: {
          200: SupervisorResponseSchema,
          400: ErrorSchema,
          429: ErrorSchema,
          502: ErrorSchema,
        },
      },
    },
    async (req) => {
      const { task } = req.body;
      const supervisor = agentService.getSupervisor();
      return await supervisor.delegate(task);
    }
  );
};
