/**
 * SLO Scheduler State Management - P15/P16
 *
 * Handles state persistence for the scheduler daemon
 * P16: Added notification on recovery detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { SchedulerState, SchedulerCooldown, INITIAL_SCHEDULER_STATE } from './types';
import type { SLOStatus } from '../slo/types';
import { createNotificationSender, type NotificationSender } from '../notify';

// Cached notification sender
let notifySender: NotificationSender | null = null;

/**
 * Get or create notification sender
 */
function getNotificationSender(): NotificationSender {
  if (!notifySender) {
    notifySender = createNotificationSender({
      configPath: 'config/proxy-mcp/notifications.json',
    });
  }
  return notifySender;
}

/**
 * Load scheduler state from file
 */
export function loadState(stateFile: string): SchedulerState {
  try {
    const fullPath = path.resolve(process.cwd(), stateFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate required fields
      if (typeof parsed.lastStatus !== 'string' && parsed.lastStatus !== null) {
        return INITIAL_SCHEDULER_STATE;
      }

      return {
        ...INITIAL_SCHEDULER_STATE,
        ...parsed,
      };
    }
  } catch (error) {
    console.error('[scheduler] Failed to load state:', error);
  }

  return { ...INITIAL_SCHEDULER_STATE };
}

/**
 * Save scheduler state to file
 */
export function saveState(stateFile: string, state: SchedulerState): void {
  try {
    const fullPath = path.resolve(process.cwd(), stateFile);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('[scheduler] Failed to save state:', error);
  }
}

/**
 * Update state after a check
 */
export function updateStateAfterCheck(state: SchedulerState, status: SLOStatus, posted: boolean): SchedulerState {
  const now = new Date().toISOString();

  return {
    lastStatus: status,
    lastPostTime: posted ? now : state.lastPostTime,
    lastCheckTime: now,
    consecutiveOkCount: status === 'ok' ? state.consecutiveOkCount + 1 : 0,
  };
}

/**
 * Check if cooldown period has elapsed
 */
export function isCooldownActive(state: SchedulerState, status: SLOStatus, cooldownMinutes: SchedulerCooldown): boolean {
  if (!state.lastPostTime) {
    return false;
  }

  const lastPost = new Date(state.lastPostTime).getTime();
  const now = Date.now();
  const elapsedMinutes = (now - lastPost) / 60000;

  if (status === 'warn') {
    return elapsedMinutes < cooldownMinutes.warnMinutes;
  }

  if (status === 'critical') {
    return elapsedMinutes < cooldownMinutes.criticalMinutes;
  }

  return false;
}

/**
 * Detect recovery (transition from non-OK to OK)
 */
export function isRecovery(previousStatus: SLOStatus | null, currentStatus: SLOStatus): boolean {
  if (previousStatus === null) {
    return false;
  }

  return previousStatus !== 'ok' && currentStatus === 'ok';
}

/**
 * Check if status has changed
 */
export function hasStatusChanged(previousStatus: SLOStatus | null, currentStatus: SLOStatus): boolean {
  return previousStatus !== currentStatus;
}

/**
 * P16: Send notification on state change
 * This function is called by run-once after determining the action
 */
export async function sendStateChangeNotification(
  previousStatus: SLOStatus | null,
  currentStatus: SLOStatus,
  summary: string,
  options: {
    postUrl?: string;
    mock?: boolean;
    issueNumber?: number;
  } = {}
): Promise<void> {
  const sender = options.mock
    ? createNotificationSender({ mock: true })
    : getNotificationSender();

  // Check if this is a recovery
  if (isRecovery(previousStatus, currentStatus)) {
    await sender.send({
      level: 'recovery',
      title: 'SLO Recovered',
      summary: `SLO status recovered from ${previousStatus} to OK. ${summary}`,
      refId: options.issueNumber ? `#${options.issueNumber}` : undefined,
      issueUrl: options.postUrl,
    });
    return;
  }

  // Check if status degraded to warn or critical
  if (currentStatus === 'critical') {
    await sender.send({
      level: 'critical',
      title: 'SLO Critical',
      summary,
      refId: options.issueNumber ? `#${options.issueNumber}` : undefined,
      issueUrl: options.postUrl,
    });
  } else if (currentStatus === 'warn' && previousStatus !== 'warn') {
    await sender.send({
      level: 'warn',
      title: 'SLO Warning',
      summary,
      refId: options.issueNumber ? `#${options.issueNumber}` : undefined,
      issueUrl: options.postUrl,
    });
  }
}
