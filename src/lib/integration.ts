/** Deliberately logs only stage/status/timing, never prompts, credentials or provider errors. */
export type Stage = 'strategy_generation' | 'validation' | 'official_simulation' | 'analysis' | 'future_research' | 'future_outlook';
export function logStage(stage: Stage, status: 'started' | 'succeeded' | 'failed' | 'fallback', durationMs?: number): void {
  if (process.env.NODE_ENV === 'development') console.info('[FARSIGHT]', { stage, status, ...(durationMs === undefined ? {} : { durationMs }) });
}

export async function traceStage<T>(stage: Stage, operation: () => T | Promise<T>): Promise<T> {
  const start = Date.now();
  logStage(stage, 'started');
  try {
    const result = await operation();
    logStage(stage, 'succeeded', Date.now() - start);
    return result;
  } catch (error) {
    logStage(stage, 'failed', Date.now() - start);
    throw error;
  }
}

export class OperationTimeoutError extends Error {
  constructor() { super('Future research took too long. Your official result is still available. Please retry the optional outlook.'); }
}

/** Bound optional work even when an injected provider ignores its own cancellation signal. */
export async function withDeadline<T>(operation: Promise<T>, milliseconds = 25_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OperationTimeoutError()), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
