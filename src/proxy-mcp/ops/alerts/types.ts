/**
 * Alert Types - P14
 *
 * Type definitions for alert posting
 */

import { SLOEvaluationResult } from '../slo/types';

/**
 * Alert posting configuration
 */
export interface AlertPostConfig {
  enabled: boolean;
  mode: 'comment' | 'newIssue';
  targetIssueNumber: number | null;
  createNewOnCritical: boolean;
  repository: string | null;
}

/**
 * Alert posting result
 */
export interface AlertPostResult {
  success: boolean;
  action: 'posted' | 'skipped' | 'error';
  reason?: string;
  issueNumber?: number;
  commentId?: number;
  url?: string;
}

/**
 * GitHub API interface for posting alerts
 */
export interface GitHubAlertAPI {
  /**
   * Add a comment to an existing issue
   */
  addComment(issueNumber: number, body: string): Promise<{ id: number; url: string }>;

  /**
   * Create a new issue
   */
  createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; url: string }>;

  /**
   * Check if an issue exists
   */
  issueExists(issueNumber: number): Promise<boolean>;
}

/**
 * Alert context for posting
 */
export interface AlertContext {
  evaluation: SLOEvaluationResult;
  config: AlertPostConfig;
  repository: string;
}

/**
 * Default alert configuration
 */
export const DEFAULT_ALERT_CONFIG: AlertPostConfig = {
  enabled: true,
  mode: 'comment',
  targetIssueNumber: null,
  createNewOnCritical: false,
  repository: null,
};
