import type { FastifyReply, FastifyRequest } from "fastify";

export interface SseContext {
  signal: AbortSignal;
  disconnected: boolean;
  send(data: unknown): void;
  sendEvent(event: string, data: unknown): void;
  finish(): void;
  fail(error: unknown): void;
}

const HEARTBEAT_MS = 15000;

export function openSse(req: FastifyRequest, reply: FastifyReply): SseContext {
  reply.hijack();

  const controller = new AbortController();
  let disconnected = false;
  let closed = false;

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write("retry: 3000\n\n");

  const heartbeat = setInterval(() => {
    if (!closed) reply.raw.write(": keepalive\n\n");
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const onClose = () => {
    if (reply.raw.writableEnded) return;
    disconnected = true;
    controller.abort(new Error("Client disconnected"));
  };
  reply.raw.on("close", onClose);

  const stop = () => {
    closed = true;
    clearInterval(heartbeat);
    reply.raw.off("close", onClose);
  };

  const write = (payload: string) => {
    if (closed) return;
    reply.raw.write(payload);
  };

  return {
    signal: controller.signal,
    get disconnected() {
      return disconnected;
    },
    send(data: unknown) {
      write(`data: ${JSON.stringify(data)}\n\n`);
    },
    sendEvent(event: string, data: unknown) {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    finish() {
      if (closed) return;
      write("data: [DONE]\n\n");
      stop();
      reply.raw.end();
    },
    fail(error: unknown) {
      if (closed) return;
      const message = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : "Error";
      write(`event: error\ndata: ${JSON.stringify({ name, message })}\n\n`);
      write("data: [DONE]\n\n");
      stop();
      reply.raw.end();
    },
  };
}
