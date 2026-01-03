/**
 * SLO Scheduler State Management - P15
 *
 * Handles state persistence for the scheduler daemon
 */

import * as fs from 'fs';
import * as path from 'path';
import { SchedulerState, INITIAL_SCHEDULER_STATE } from './types';

/**
 * Load scheduler state from file
 */
export function loadState(stateFile: string): SchedulerState {
  try {
    const fullPath = path.resolve(process.cwd(), stateFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(content) as SchedulerState;
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
export function updateStateAfterCheck(
  state: SchedulerState,
  status: 'ok' | 'warn' | 'critical',
  posted: boolean
): SchedulerState {
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
export function isCooldownActive(
  state: SchedulerState,
  status: 'ok' | 'warn' | 'critical',
  cooldownMinutes: { warnMinutes: number; criticalMinutes: number }
): boolean {
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
export function isRecovery(
  previousStatus: 'ok' | 'warn' | 'critical' | null,
  currentStatus: 'ok' | 'warn' | 'critical'
): boolean {
  if (previousStatus === null) {
    return false;
  }
  return previousStatus !== 'ok' && currentStatus === 'ok';
}

/**
 * Check if status has changed
 */
export function hasStatusChanged(
  previousStatus: 'ok' | 'warn' | 'critical' | null,
  currentStatus: 'ok' | 'warn' | 'critical'
): boolean {
  return previousStatus !== currentStatus;
}
