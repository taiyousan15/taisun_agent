/**
 * Environment Check for GitHub Issue Logging
 *
 * Validates that all required environment variables and tools
 * are available for issue logging to work.
 */

import { execSync } from 'child_process';
import { t } from '../i18n';

export interface EnvCheckItem {
  key: string;
  message: string;
}

export interface EnvCheckResult {
  valid: boolean;
  errors: EnvCheckItem[];
  warnings: EnvCheckItem[];
}

/**
 * Check if gh CLI is available and authenticated
 */
export function isGhCliAvailable(): boolean {
  try {
    execSync('gh --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gh CLI is authenticated
 */
export function isGhCliAuthenticated(): boolean {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repository from git remote
 */
export function getRepoFromGit(): string | null {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();

    // Parse GitHub URL (supports both HTTPS and SSH)
    const match = remote.match(/github\.com[/:]([\w.-]+\/[\w.-]+)/);
    if (match) {
      return match[1].replace(/\.git$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if GITHUB_TOKEN is set
 */
export function hasGitHubToken(): boolean {
  const token = process.env.GITHUB_TOKEN;
  return !!(token && token.length > 0 && !token.includes('xxxx'));
}

/**
 * Redact a token for safe logging (show only first 4 chars)
 */
export function redactToken(token: string): string {
  if (!token || token.length < 8) {
    return '****';
  }
  return token.substring(0, 4) + '****';
}

/**
 * Check all GitHub environment requirements
 */
export function checkGitHubEnv(): EnvCheckResult {
  const errors: EnvCheckItem[] = [];
  const warnings: EnvCheckItem[] = [];

  // Check GITHUB_TOKEN
  if (!hasGitHubToken()) {
    errors.push({
      key: 'GITHUB_TOKEN',
      message: t('env.missing.github_token'),
    });
  }

  // Check gh CLI
  if (!isGhCliAvailable()) {
    errors.push({
      key: 'gh CLI',
      message: t('env.missing.gh_cli'),
    });
  } else if (!isGhCliAuthenticated()) {
    warnings.push({
      key: 'gh CLI',
      message: 'gh CLI is installed but not authenticated. Run: gh auth login',
    });
  }

  // Check repository
  const repo = getRepoFromGit();
  if (!repo) {
    errors.push({
      key: 'Repository',
      message: t('env.missing.repo'),
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Require GitHub environment to be valid
 * Throws an error with helpful message if not valid
 */
export function requireGitHubEnv(): void {
  const result = checkGitHubEnv();

  if (!result.valid) {
    const errorMessages = result.errors
      .map((e) => `\n### ${e.key}\n${e.message}`)
      .join('\n');

    const fullMessage = `${t('env.check.failed')}\n${errorMessages}`;

    throw new GitHubEnvError(fullMessage, result);
  }
}

/**
 * Custom error for GitHub environment issues
 */
export class GitHubEnvError extends Error {
  public readonly checkResult: EnvCheckResult;

  constructor(message: string, checkResult: EnvCheckResult) {
    super(message);
    this.name = 'GitHubEnvError';
    this.checkResult = checkResult;
  }
}

/**
 * Format check result for console output
 */
export function formatCheckResult(result: EnvCheckResult): string {
  const lines: string[] = [t('doctor.title'), ''];

  if (result.valid) {
    lines.push(t('env.check.success'));
  } else {
    lines.push(t('env.check.failed'));
    lines.push('');

    for (const error of result.errors) {
      lines.push(t('doctor.result.error', { item: error.key, message: '' }));
      lines.push(error.message);
      lines.push('');
    }
  }

  for (const warning of result.warnings) {
    lines.push(t('doctor.result.warn', { item: warning.key, message: warning.message }));
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push(t('doctor.summary.all_ok'));
  } else if (!result.valid) {
    lines.push(t('doctor.summary.has_errors', { count: result.errors.length }));
  }

  return lines.join('\n');
}
