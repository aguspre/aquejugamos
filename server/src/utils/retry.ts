export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor?: number;
  jitterRatio?: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  getCustomDelayMs?: (error: unknown, attempt: number) => number | undefined;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleepFn?: (ms: number) => Promise<void>;
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    factor = 2,
    jitterRatio = 0.15,
    shouldRetry,
    getCustomDelayMs,
    onRetry,
    sleepFn = defaultSleep,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const customDelay = getCustomDelayMs?.(error, attempt);
      const baseDelay =
        customDelay ?? Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);

      const jitter =
        jitterRatio > 0 ? Math.floor(baseDelay * jitterRatio * Math.random()) : 0;
      const delayMs = Math.min(baseDelay + jitter, maxDelayMs);

      onRetry?.(error, attempt, delayMs);
      await sleepFn(delayMs);
    }
  }

  throw lastError;
}
