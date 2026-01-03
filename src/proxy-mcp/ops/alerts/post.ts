/**
 * Alert Posting - P14
 *
 * Posts SLO alerts to GitHub issues
 */

import { execSync } from 'child_process';
import { SLOEvaluationResult } from '../slo/types';
import { formatForIssueComment, formatShortSummary, redactSensitiveData } from '../slo/summary';
import { AlertPostConfig, AlertPostResult, GitHubAlertAPI, DEFAULT_ALERT_CONFIG } from './types';

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
    async addComment(issueNumber: number, body: string): Promise<{ id: number; url: string }> {
      const repoName = getRepo();
      const escapedBody = body.replace(/'/g, "'\\''");
      const output = execSync(
        `gh issue comment ${issueNumber} --repo ${repoName} --body '${escapedBody}' 2>&1`,
        { encoding: 'utf-8' }
      ).trim();

      // gh issue comment returns the URL
      const url = output || `https://github.com/${repoName}/issues/${issueNumber}`;
      return { id: Date.now(), url };
    },

    async createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; url: string }> {
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
export function createMockGitHubAlertAPI(): GitHubAlertAPI & {
  comments: Array<{ issueNumber: number; body: string }>;
  issues: Array<{ title: string; body: string; labels?: string[] }>;
} {
  const comments: Array<{ issueNumber: number; body: string }> = [];
  const issues: Array<{ title: string; body: string; labels?: string[] }> = [];

  return {
    comments,
    issues,
    async addComment(issueNumber: number, body: string): Promise<{ id: number; url: string }> {
      comments.push({ issueNumber, body });
      return { id: comments.length, url: `https://github.com/test/repo/issues/${issueNumber}#comment-${comments.length}` };
    },
    async createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; url: string }> {
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
export function shouldPostAlert(evaluation: SLOEvaluationResult, config: AlertPostConfig): boolean {
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
 * Post an alert to GitHub
 */
export async function postAlert(
  evaluation: SLOEvaluationResult,
  config: AlertPostConfig = DEFAULT_ALERT_CONFIG,
  api?: GitHubAlertAPI
): Promise<AlertPostResult> {
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
  const githubAPI = api || createGitHubAlertAPI(config.repository || undefined);

  try {
    // Format the alert body (already redacted in formatForIssueComment)
    const body = formatForIssueComment(evaluation);
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
