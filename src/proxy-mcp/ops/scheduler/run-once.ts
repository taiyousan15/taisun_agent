/**
 * SLO Scheduler Run Once - P15/P16
 *
 * Executes a single SLO check cycle with deduplication, cooldown,
 * and notification integration (P16)
 */

import { SchedulerConfig, RunOnceResult, DEFAULT_SCHEDULER_CONFIG } from './types';
import {
  loadState,
  saveState,
  updateStateAfterCheck,
  isCooldownActive,
  isRecovery,
  hasStatusChanged,
  sendStateChangeNotification,
} from './state';
import { loadSLOConfig, evaluateSLOs } from '../slo/evaluate';
import { postAlert, createMockGitHubAlertAPI, createGitHubAlertAPI } from '../alerts/post';
import type { GitHubAlertAPI } from '../alerts/types';
import { formatShortSummary } from '../slo/summary';
import { JobStoreService, JsonlJobStore, JobQueue } from '../../jobs';

export interface RunOnceOptions {
  config?: SchedulerConfig;
  dryRun?: boolean;
  verbose?: boolean;
  mockApi?: boolean;
  mockNotify?: boolean;
  api?: GitHubAlertAPI;
}

/**
 * Execute a single SLO check cycle
 */
export async function runOnce(options: RunOnceOptions = {}): Promise<RunOnceResult> {
  const config = options.config || DEFAULT_SCHEDULER_CONFIG;
  const timestamp = new Date().toISOString();

  // Check if scheduler is enabled
  if (!config.scheduler.enabled) {
    return {
      status: 'ok',
      action: 'skipped',
      reason: 'Scheduler is disabled',
      timestamp,
    };
  }

  // Load state
  const state = loadState(config.stateFile);

  // Initialize job queue for SLO evaluation
  const jobsDir = process.env.JOBS_DIR || '.taisun/jobs';
  const store = new JobStoreService(new JsonlJobStore(`${jobsDir}/jobs.jsonl`));
  await store.init();
  const queue = new JobQueue(store);

  // Run SLO evaluation
  const sloConfig = loadSLOConfig();
  const evaluation = await evaluateSLOs(queue, sloConfig);
  const currentStatus = evaluation.overallStatus;

  if (options.verbose) {
    console.log(`[scheduler] SLO status: ${currentStatus} - ${formatShortSummary(evaluation)}`);
  }

  // Determine if we should post
  let shouldPost = false;
  let reason = '';

  // Case 1: Status changed to non-OK
  if (currentStatus !== 'ok' && hasStatusChanged(state.lastStatus, currentStatus)) {
    shouldPost = true;
    reason = `Status changed from ${state.lastStatus || 'none'} to ${currentStatus}`;
  }
  // Case 2: Recovery (non-OK -> OK)
  else if (isRecovery(state.lastStatus, currentStatus) && config.scheduler.postOnRecovery) {
    shouldPost = true;
    reason = `Recovered from ${state.lastStatus} to OK`;
  }
  // Case 3: Same non-OK status, check cooldown
  else if (currentStatus !== 'ok' && !hasStatusChanged(state.lastStatus, currentStatus)) {
    if (!isCooldownActive(state, currentStatus, config.scheduler.cooldown)) {
      shouldPost = true;
      reason = `Cooldown elapsed for ${currentStatus}`;
    } else {
      reason = `Cooldown active for ${currentStatus}`;
    }
  }
  // Case 4: Status is OK and no change
  else if (currentStatus === 'ok') {
    reason = 'Status is OK';
  }

  // Handle dry run
  if (options.dryRun) {
    const newState = updateStateAfterCheck(state, currentStatus, false);
    saveState(config.stateFile, newState);
    return {
      status: currentStatus,
      action: 'skipped',
      reason: `[DRY RUN] Would ${shouldPost ? 'post' : 'skip'}: ${reason}`,
      timestamp,
    };
  }

  // Post if needed
  if (shouldPost) {
    const alertConfig = {
      enabled: true,
      mode: config.alerts.targetIssueNumber ? ('comment' as const) : ('newIssue' as const),
      targetIssueNumber: config.alerts.targetIssueNumber ?? undefined,
      repository: `${config.alerts.owner}/${config.alerts.repo}`,
      createNewOnCritical: false,
    };

    // Use provided API, mock API, or real API
    const api = options.api || (options.mockApi ? createMockGitHubAlertAPI() : createGitHubAlertAPI(alertConfig.repository || undefined));
    const result = await postAlert(evaluation, alertConfig, api);

    if (options.verbose) {
      console.log(`[scheduler] Alert result: ${result.action} - ${result.reason || result.url || ''}`);
    }

    // Update state
    const newState = updateStateAfterCheck(state, currentStatus, result.action === 'posted');
    saveState(config.stateFile, newState);

    // P16: Send notification on state change
    if (result.action === 'posted') {
      try {
        await sendStateChangeNotification(state.lastStatus, currentStatus, formatShortSummary(evaluation), {
          postUrl: result.url,
          mock: options.mockNotify ?? options.mockApi ?? false,
          issueNumber: result.issueNumber,
        });
        if (options.verbose) {
          console.log('[scheduler] Notification sent');
        }
      } catch (notifyError) {
        // Don't fail the scheduler if notification fails
        if (options.verbose) {
          console.error('[scheduler] Notification failed:', notifyError);
        }
      }

      return {
        status: currentStatus,
        action: 'posted',
        reason,
        timestamp,
        postUrl: result.url,
      };
    } else {
      return {
        status: currentStatus,
        action: 'suppressed',
        reason: result.reason || reason,
        timestamp,
      };
    }
  }

  // Update state without posting
  const newState = updateStateAfterCheck(state, currentStatus, false);
  saveState(config.stateFile, newState);

  return {
    status: currentStatus,
    action: 'suppressed',
    reason,
    timestamp,
  };
}
