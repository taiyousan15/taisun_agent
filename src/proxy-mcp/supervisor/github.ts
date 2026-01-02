/**
 * GitHub Integration - M6
 *
 * Issue logging and approval management
 */

import { execSync } from 'child_process';
import { SupervisorState, ExecutionPlan } from './types';

/**
 * Check if gh CLI is available
 */
export function isGhAvailable(): boolean {
  try {
    execSync('gh --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get default repository from git remote
 */
export function getDefaultRepo(): string | null {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf8', stdio: 'pipe' }).trim();
    // Parse GitHub URL
    const match = remote.match(/github\.com[/:]([\w-]+\/[\w-]+)/);
    if (match) {
      return match[1].replace(/\.git$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a RUNLOG issue for tracking the supervisor run
 */
export async function createRunlogIssue(
  state: SupervisorState,
  repo?: string
): Promise<number | null> {
  if (!isGhAvailable()) {
    console.warn('[Supervisor] gh CLI not available, skipping RUNLOG issue');
    return null;
  }

  const targetRepo = repo || getDefaultRepo();
  if (!targetRepo) {
    console.warn('[Supervisor] Could not determine repository, skipping RUNLOG issue');
    return null;
  }

  const body = `## Supervisor Run: ${state.runId}

**Input:** ${state.input.substring(0, 200)}${state.input.length > 200 ? '...' : ''}

**Started:** ${state.timestamps.started}

**Status:** ${state.step}

---

This issue tracks the supervisor run. Updates will be posted as comments.
`;

  try {
    const result = execSync(
      `gh issue create --repo ${targetRepo} --title "[SUPERVISOR] ${state.runId}" --body "${body.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();
    // Extract issue number from URL
    const match = result.match(/\/issues\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch (err) {
    console.error('[Supervisor] Failed to create RUNLOG issue:', err);
    return null;
  }
}

/**
 * Create an approval request issue
 */
export async function createApprovalIssue(
  state: SupervisorState,
  plan: ExecutionPlan,
  repo?: string
): Promise<number | null> {
  if (!isGhAvailable()) {
    console.warn('[Supervisor] gh CLI not available, cannot create approval issue');
    return null;
  }

  const targetRepo = repo || getDefaultRepo();
  if (!targetRepo) {
    console.warn('[Supervisor] Could not determine repository');
    return null;
  }

  const stepsText = plan.steps
    .map((s, i) => `${i + 1}. **${s.action}** (${s.risk} risk)${s.target ? ` - ${s.target}` : ''}`)
    .join('\n');

  const body = `## Approval Required

**Run ID:** ${state.runId}

**Input:** ${state.input.substring(0, 500)}${state.input.length > 500 ? '...' : ''}

**Risk Level:** ${plan.estimatedRisk}

**Reason:** ${plan.approvalReason || 'Dangerous operation detected'}

### Planned Steps

${stepsText}

---

## How to Approve

1. Review the planned steps above
2. Comment \`APPROVE\` on this issue to proceed
3. Or add the \`approved\` label

## How to Reject

Comment \`REJECT\` to abort the operation.

---

⚠️ **This operation will not proceed without explicit approval.**
`;

  try {
    const result = execSync(
      `gh issue create --repo ${targetRepo} --title "[APPROVAL] ${state.runId}" --body "${body.replace(/"/g, '\\"')}" --label "approval-required"`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();
    const match = result.match(/\/issues\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch (err) {
    console.error('[Supervisor] Failed to create approval issue:', err);
    return null;
  }
}

/**
 * Check if an issue has been approved
 */
export async function checkApproval(
  issueId: number,
  repo?: string
): Promise<{ approved: boolean; approvedBy?: string; rejectedBy?: string }> {
  if (!isGhAvailable()) {
    return { approved: false };
  }

  const targetRepo = repo || getDefaultRepo();
  if (!targetRepo) {
    return { approved: false };
  }

  try {
    // Check for approved label
    const labels = execSync(
      `gh issue view ${issueId} --repo ${targetRepo} --json labels -q '.labels[].name'`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    if (labels.includes('approved')) {
      return { approved: true };
    }

    // Check for APPROVE/REJECT comments
    const comments = execSync(
      `gh issue view ${issueId} --repo ${targetRepo} --json comments -q '.comments[] | "\\(.author.login): \\(.body)"'`,
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    for (const line of comments.split('\n')) {
      const match = line.match(/^(\w+): (.+)/);
      if (match) {
        const [, author, body] = match;
        if (body.trim().toUpperCase() === 'APPROVE') {
          return { approved: true, approvedBy: author };
        }
        if (body.trim().toUpperCase() === 'REJECT') {
          return { approved: false, rejectedBy: author };
        }
      }
    }

    return { approved: false };
  } catch (err) {
    console.error('[Supervisor] Failed to check approval:', err);
    return { approved: false };
  }
}

/**
 * Add a comment to an issue
 */
export async function addIssueComment(
  issueId: number,
  comment: string,
  repo?: string
): Promise<boolean> {
  if (!isGhAvailable()) {
    return false;
  }

  const targetRepo = repo || getDefaultRepo();
  if (!targetRepo) {
    return false;
  }

  try {
    execSync(
      `gh issue comment ${issueId} --repo ${targetRepo} --body "${comment.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch (err) {
    console.error('[Supervisor] Failed to add comment:', err);
    return false;
  }
}

/**
 * Close an issue
 */
export async function closeIssue(
  issueId: number,
  comment?: string,
  repo?: string
): Promise<boolean> {
  if (!isGhAvailable()) {
    return false;
  }

  const targetRepo = repo || getDefaultRepo();
  if (!targetRepo) {
    return false;
  }

  try {
    if (comment) {
      await addIssueComment(issueId, comment, targetRepo);
    }
    execSync(`gh issue close ${issueId} --repo ${targetRepo}`, { stdio: 'pipe' });
    return true;
  } catch (err) {
    console.error('[Supervisor] Failed to close issue:', err);
    return false;
  }
}
