/**
 * SLO Scheduler Run Loop - P15
 *
 * Continuous scheduler loop with interval
 */

import { SchedulerConfig, DEFAULT_SCHEDULER_CONFIG, RunOnceResult } from './types';
import { runOnce, RunOnceOptions } from './run-once';

export interface RunLoopOptions extends RunOnceOptions {
  onTick?: (result: RunOnceResult) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
      });
    }
  });
}

/**
 * Run the scheduler loop continuously
 */
export async function runLoop(options: RunLoopOptions = {}): Promise<void> {
  const config = options.config || DEFAULT_SCHEDULER_CONFIG;
  const intervalMs = config.scheduler.intervalSeconds * 1000;

  console.log(`[scheduler] Starting loop with interval ${config.scheduler.intervalSeconds}s`);

  while (!options.signal?.aborted) {
    try {
      const result = await runOnce(options);
      if (options.onTick) {
        options.onTick(result);
      }
    } catch (error) {
      if (options.onError && error instanceof Error) {
        options.onError(error);
      } else {
        console.error('[scheduler] Error in run cycle:', error);
      }
    }

    try {
      await sleep(intervalMs, options.signal);
    } catch {
      // Aborted
      break;
    }
  }

  console.log('[scheduler] Loop stopped');
}

/**
 * Run a single cycle (alias for runOnce for CLI)
 */
export { runOnce };
