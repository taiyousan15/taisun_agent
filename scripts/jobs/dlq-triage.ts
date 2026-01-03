#!/usr/bin/env node
/* istanbul ignore file */
/**
 * DLQ Triage CLI - P13
 *
 * Usage:
 *   npm run jobs:dlq:triage                    # Show DLQ summary
 *   npm run jobs:dlq:triage -- --post          # Post triage issue to GitHub
 *   npm run jobs:dlq:triage -- --json          # Output as JSON
 *   npm run jobs:dlq:triage -- --help          # Show help
 *
 * Environment:
 *   GITHUB_TOKEN   - Required for --post
 *   GITHUB_REPO    - Repository (default: from git remote)
 */

import { execSync } from 'child_process';
import {
  JobStoreService,
  JobQueue,
  generateTriageSummary,
  generateTriageIssueBody,
  formatTriageSummaryForConsole,
} from '../../src/proxy-mcp/jobs';

interface CliArgs {
  help: boolean;
  post: boolean;
  json: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    help: args.includes('--help') || args.includes('-h'),
    post: args.includes('--post'),
    json: args.includes('--json'),
  };
}

function showHelp(): void {
  console.log(`
DLQ Triage CLI

Usage:
  npm run jobs:dlq:triage [options]

Options:
  --post          Post triage summary as GitHub Issue
  --json          Output as JSON (for scripting)
  --help, -h      Show this help message

Environment Variables:
  GITHUB_TOKEN    Required for --post option
  GITHUB_REPO     Repository in owner/repo format (default: detected from git remote)

Examples:
  npm run jobs:dlq:triage                     Show DLQ triage summary
  npm run jobs:dlq:triage -- --json           Output as JSON
  npm run jobs:dlq:triage -- --post           Create GitHub issue with summary
`);
}

function getGitHubRepo(): string | null {
  // Check environment first
  if (process.env.GITHUB_REPO) {
    return process.env.GITHUB_REPO;
  }

  // Try to detect from git remote
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    // Extract owner/repo from URL
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (match) {
      return match[1].replace(/\.git$/, '');
    }
  } catch {
    // Ignore errors
  }

  return null;
}

async function postIssueToGitHub(title: string, body: string, labels: string[], repo: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required for --post');
  }

  const labelsArg = labels.map((l) => `--label "${l}"`).join(' ');

  try {
    const result = execSync(
      `gh issue create --repo "${repo}" --title "${title.replace(/"/g, '\\"')}" --body "$(cat <<'TRIAGEBODY'
${body}
TRIAGEBODY
)" ${labelsArg}`,
      { encoding: 'utf-8' }
    );
    return result.trim();
  } catch (error) {
    throw new Error(`Failed to create GitHub issue: ${error}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Initialize job store and queue
  const store = JobStoreService.fromConfig({ type: 'inmemory' });
  await store.init();
  const queue = new JobQueue(store);

  // Generate triage summary
  const summary = generateTriageSummary(queue);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.post) {
    if (summary.totalCount === 0) {
      console.log('[dlq-triage] DLQ is empty. No issue to post.');
      process.exit(0);
    }

    const repo = getGitHubRepo();
    if (!repo) {
      console.error('[dlq-triage] ERROR: Could not determine GitHub repository.');
      console.error('Set GITHUB_REPO environment variable or run from a git repository.');
      process.exit(1);
    }

    const issueBody = generateTriageIssueBody(summary);

    console.log(`[dlq-triage] Posting triage issue to ${repo}...`);
    try {
      const issueUrl = await postIssueToGitHub(issueBody.title, issueBody.body, issueBody.labels, repo);
      console.log(`[dlq-triage] Issue created: ${issueUrl}`);
    } catch (error) {
      console.error(`[dlq-triage] ERROR: ${error}`);
      process.exit(1);
    }
  } else {
    // Default: show console summary
    if (summary.totalCount === 0) {
      console.log('[dlq-triage] DLQ is empty.');
    } else {
      console.log(formatTriageSummaryForConsole(summary));
    }
  }

  await store.close();
}

main().catch((error) => {
  console.error('[dlq-triage] Fatal error:', error);
  process.exit(1);
});
