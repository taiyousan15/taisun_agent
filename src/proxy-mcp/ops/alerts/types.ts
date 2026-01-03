/**
 * Alert Types - P14
 *
 * Type definitions for GitHub alert posting
 */

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  mode: 'comment' | 'newIssue';
  targetIssueNumber?: number;
  repository?: string;
  createNewOnCritical?: boolean;
}

/**
 * Alert post result
 */
export interface AlertPostResult {
  success: boolean;
  action: 'posted' | 'skipped' | 'suppressed' | 'error';
  issueNumber?: number;
  commentId?: number;
  url?: string;
  reason?: string;
}

/**
 * GitHub Alert API interface
 */
export interface GitHubAlertAPI {
  addComment(issueNumber: number, body: string): Promise<{ id: number; url: string }>;
  createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; url: string }>;
  issueExists(issueNumber: number): Promise<boolean>;
}

/**
 * Mock GitHub API (for testing)
 */
export interface MockGitHubAlertAPI extends GitHubAlertAPI {
  comments: Array<{ issueNumber: number; body: string }>;
  issues: Array<{ title: string; body: string; labels?: string[] }>;
}

/**
 * Default alert configuration
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  mode: 'comment',
  targetIssueNumber: undefined,
  repository: undefined,
  createNewOnCritical: false,
};
