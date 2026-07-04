export async function retry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    minDelay?: number;
    maxDelay?: number;
    factor?: number;
  },
): Promise<T> {
  const {
    maxRetries = 3,
    minDelay = 100,
    maxDelay = 60000,
    factor = 2,
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(minDelay * Math.pow(factor, attempt - 1), maxDelay);
        const jitter = Math.random() * delay * 0.5;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
