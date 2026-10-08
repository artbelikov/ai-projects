export class LLMError extends Error {
  readonly provider: string;
  readonly statusCode?: number;

  constructor(message: string, provider: string, statusCode?: number) {
    super(message);
    this.name = "LLMError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends LLMError {
  constructor(message: string, provider: string) {
    super(message, provider, 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends LLMError {
  readonly retryAfterMs?: number;

  constructor(message: string, provider: string, retryAfterMs?: number) {
    super(message, provider, 429);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class InvalidRequestError extends LLMError {
  constructor(message: string, provider: string, statusCode = 400) {
    super(message, provider, statusCode);
    this.name = "InvalidRequestError";
  }
}

export class NetworkError extends LLMError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = "NetworkError";
  }
}

function isLLMError(err: unknown): err is LLMError {
  return err instanceof LLMError;
}

function readStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = err as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return undefined;
}

export function mapHttpError(
  status: number,
  provider: string,
  body: string,
  headers?: Headers
): LLMError {
  const detail = body.slice(0, 300) || `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new AuthenticationError(
      `Authentication failed for ${provider}: ${detail}`,
      provider
    );
  }
  if (status === 429) {
    return new RateLimitError(
      `Rate limited by ${provider}: ${detail}`,
      provider,
      parseRetryAfterMs(headers)
    );
  }
  return new LLMError(`${provider} request failed: ${detail}`, provider, status);
}

export async function errorFromResponse(
  response: Response,
  provider: string
): Promise<LLMError> {
  const body = await response.text().catch(() => "");
  return mapHttpError(response.status, provider, body, response.headers);
}

export function toLLMError(err: unknown, provider: string): LLMError {
  if (isLLMError(err)) return err;
  const status = readStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status !== undefined) return mapHttpError(status, provider, message);
  return new NetworkError(`${provider} network error: ${message}`, provider);
}

export function parseRetryAfterMs(headers?: Headers): number | undefined {
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry<T>(
  provider: string,
  fn: () => Promise<T>,
  options: { maxRetries?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  let lastError: LLMError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const mapped = toLLMError(err, provider);
      lastError = mapped;
      const transient =
        mapped instanceof RateLimitError ||
        mapped instanceof NetworkError ||
        (mapped.statusCode !== undefined && mapped.statusCode >= 500);
      if (!transient || attempt === maxRetries) throw mapped;
      const backoff =
        mapped instanceof RateLimitError && mapped.retryAfterMs !== undefined
          ? mapped.retryAfterMs
          : 250 * 2 ** attempt;
      await sleep(backoff, options.signal);
    }
  }

  throw lastError ?? new NetworkError(`${provider} request failed`, provider);
}
