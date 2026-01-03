/**
 * Alert Posting - P14/P16
 *
 * Posts SLO alerts to GitHub issues.
 * P16: Added DLQ triage guidance integration.
 */

import { execSync } from 'child_process';
import { SLOEvaluationResult } from '../slo/types';
import { formatForIssueComment, formatShortSummary, redactSensitiveData } from '../slo/summary';
import { AlertConfig, AlertPostResult, GitHubAlertAPI, MockGitHubAlertAPI, DEFAULT_ALERT_CONFIG } from './types';
import type { DLQEntry } from '../../jobs/types';
import { analyzeTriageAssist, formatTriageAssistMarkdown } from '../triage/triage-assist';

/**
 * Create a real GitHub API using gh CLI
 */
export function createGitHubAlertAPI(repo?: string): GitHubAlertAPI {
  const getRepo = (): string => {
    if (repo) return repo;
    try {
      const output = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
        encoding: 'utf-8',
      }).trim();
      return output;
    } catch {
      throw new Error('Could not determine repository. Set WATCHER_REPO or run in a git repository.');
    }
  };

  return {
    async addComment(issueNumber: number, body: string) {
      const repoName = getRepo();
      const escapedBody = body.replace(/'/g, "'\\''");
      const output = execSync(`gh issue comment ${issueNumber} --repo ${repoName} --body '${escapedBody}' 2>&1`, {
        encoding: 'utf-8',
      }).trim();
      // gh issue comment returns the URL
      const url = output || `https://github.com/${repoName}/issues/${issueNumber}`;
      return { id: Date.now(), url };
    },
    async createIssue(title: string, body: string, labels?: string[]) {
      const repoName = getRepo();
      const escapedTitle = title.replace(/'/g, "'\\''");
      const escapedBody = body.replace(/'/g, "'\\''");
      const labelArg = labels && labels.length > 0 ? `--label "${labels.join(',')}"` : '';
      const output = execSync(
        `gh issue create --repo ${repoName} --title '${escapedTitle}' --body '${escapedBody}' ${labelArg}`,
        { encoding: 'utf-8' }
      ).trim();
      // gh issue create returns the URL like https://github.com/owner/repo/issues/123
      const match = output.match(/issues\/(\d+)/);
      const number = match ? parseInt(match[1], 10) : 0;
      return { number, url: output };
    },
    async issueExists(issueNumber: number): Promise<boolean> {
      const repoName = getRepo();
      try {
        execSync(`gh issue view ${issueNumber} --repo ${repoName} --json number`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Create a mock GitHub API for testing
 */
export function createMockGitHubAlertAPI(): MockGitHubAlertAPI {
  const comments: Array<{ issueNumber: number; body: string }> = [];
  const issues: Array<{ title: string; body: string; labels?: string[] }> = [];

  return {
    comments,
    issues,
    async addComment(issueNumber: number, body: string) {
      comments.push({ issueNumber, body });
      return { id: comments.length, url: `https://github.com/test/repo/issues/${issueNumber}#comment-${comments.length}` };
    },
    async createIssue(title: string, body: string, labels?: string[]) {
      issues.push({ title, body, labels });
      return { number: issues.length, url: `https://github.com/test/repo/issues/${issues.length}` };
    },
    async issueExists(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Determine if we should post an alert
 */
export function shouldPostAlert(evaluation: SLOEvaluationResult, config: AlertConfig): boolean {
  // Don't post if disabled
  if (!config.enabled) {
    return false;
  }

  // Only post for WARN or CRITICAL
  if (evaluation.overallStatus === 'ok') {
    return false;
  }

  // For comment mode, need a target issue
  if (config.mode === 'comment' && !config.targetIssueNumber) {
    return false;
  }

  return true;
}

/**
 * Extended alert options (P16)
 */
export interface PostAlertOptions {
  config?: AlertConfig;
  api?: GitHubAlertAPI;
  dlqEntries?: DLQEntry[];
}

/**
 * Post an alert to GitHub
 */
export async function postAlert(
  evaluation: SLOEvaluationResult,
  configOrOptions: AlertConfig | PostAlertOptions = DEFAULT_ALERT_CONFIG,
  api?: GitHubAlertAPI
): Promise<AlertPostResult> {
  // Handle both old and new signatures
  let config: AlertConfig;
  let dlqEntries: DLQEntry[] | undefined;
  let githubAPI: GitHubAlertAPI | undefined;

  if ('enabled' in configOrOptions) {
    // Old signature: postAlert(evaluation, config, api)
    config = configOrOptions;
    githubAPI = api;
  } else {
    // New signature: postAlert(evaluation, options)
    config = configOrOptions.config || DEFAULT_ALERT_CONFIG;
    githubAPI = configOrOptions.api;
    dlqEntries = configOrOptions.dlqEntries;
  }

  // Check if we should post
  if (!shouldPostAlert(evaluation, config)) {
    if (!config.enabled) {
      return { success: true, action: 'skipped', reason: 'Alerts disabled' };
    }
    if (evaluation.overallStatus === 'ok') {
      return { success: true, action: 'skipped', reason: 'Status is OK' };
    }
    if (config.mode === 'comment' && !config.targetIssueNumber) {
      return { success: false, action: 'error', reason: 'No target issue configured for comment mode' };
    }
    return { success: true, action: 'skipped', reason: 'No action needed' };
  }

  // Create API if not provided
  githubAPI = githubAPI || createGitHubAlertAPI(config.repository || undefined);

  try {
    // Format the alert body (already redacted in formatForIssueComment)
    let body = formatForIssueComment(evaluation);

    // P16: Append DLQ triage guidance if DLQ entries are provided
    if (dlqEntries && dlqEntries.length > 0) {
      const triageResult = analyzeTriageAssist(dlqEntries);
      body += '\n\n' + triageResult.markdown;
    }

    const redactedBody = redactSensitiveData(body);

    // Determine action based on mode and severity
    const shouldCreateNew = config.mode === 'newIssue' || (config.createNewOnCritical && evaluation.overallStatus === 'critical');

    if (shouldCreateNew) {
      // Create a new issue
      const title = `[SLO Alert] ${formatShortSummary(evaluation)}`;
      const labels = ['slo-alert', evaluation.overallStatus];
      const result = await githubAPI.createIssue(title, redactedBody, labels);

      return {
        success: true,
        action: 'posted',
        issueNumber: result.number,
        url: result.url,
      };
    } else {
      // Add comment to existing issue
      const issueNumber = config.targetIssueNumber!;
      const result = await githubAPI.addComment(issueNumber, redactedBody);

      return {
        success: true,
        action: 'posted',
        issueNumber,
        commentId: result.id,
        url: result.url,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      action: 'error',
      reason: redactSensitiveData(message),
    };
  }
}
