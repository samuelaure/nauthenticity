export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delay: number;
    factor: number;
  } = { attempts: 3, delay: 2000, factor: 2 },
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;
  let currentDelay = options.delay;

  for (let i = 0; i < options.attempts; i++) {
    try {
      return await fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      lastError = error;
      console.warn(
        `[Retry] Attempt ${i + 1} failed: ${error.message}. Retrying in ${currentDelay}ms...`,
      );

      // Don't wait on the last attempt
      if (i < options.attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        currentDelay *= options.factor;
      }
    }
  }

  throw lastError;
}
