/**
 * Approval Binding - P11
 *
 * Validates that approvals are bound to specific plans.
 * Prevents plan substitution attacks and enforces TTL.
 */

import * as crypto from 'crypto';
import { ExecutionPlan, ApprovalStatus, PlanStep } from './types';
import { getApprovalTtlHours, requiresPlanHash } from '../policy';

/**
 * Generate a SHA-256 hash of the execution plan steps
 */
export function generatePlanHash(steps: PlanStep[]): string {
  // Normalize steps for consistent hashing
  const normalized = steps.map((step) => ({
    id: step.id,
    action: step.action,
    target: step.target,
    params: step.params,
    risk: step.risk,
  }));

  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Create an execution plan with hash
 */
export function createExecutionPlanWithHash(
  steps: PlanStep[],
  estimatedRisk: ExecutionPlan['estimatedRisk'],
  requiresApproval: boolean,
  approvalReason?: string
): ExecutionPlan {
  return {
    steps,
    estimatedRisk,
    requiresApproval,
    approvalReason,
    planHash: generatePlanHash(steps),
  };
}

/**
 * Calculate expiry time based on TTL from policy
 */
export function calculateApprovalExpiry(): string {
  const ttlHours = getApprovalTtlHours();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Create an approval status with plan hash and expiry
 */
export function createApprovalStatus(
  plan: ExecutionPlan,
  approvedBy: string,
  reason?: string
): ApprovalStatus {
  const now = new Date().toISOString();
  return {
    required: plan.requiresApproval,
    approved: true,
    approvedBy,
    approvedAt: now,
    reason,
    approvedPlanHash: plan.planHash,
    expiresAt: calculateApprovalExpiry(),
  };
}

/**
 * Validation result
 */
export interface ApprovalValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that an approval is valid for the given plan
 */
export function validateApproval(
  plan: ExecutionPlan,
  approval: ApprovalStatus
): ApprovalValidation {
  // Check if approval is granted
  if (!approval.approved) {
    return {
      valid: false,
      reason: 'Approval not granted',
    };
  }

  // Check if plan hash is required
  if (requiresPlanHash()) {
    // Verify plan has a hash
    if (!plan.planHash) {
      return {
        valid: false,
        reason: 'Plan hash is required but not provided',
      };
    }

    // Verify approval has a plan hash
    if (!approval.approvedPlanHash) {
      return {
        valid: false,
        reason: 'Approval does not have a plan hash',
      };
    }

    // Verify hashes match
    if (plan.planHash !== approval.approvedPlanHash) {
      return {
        valid: false,
        reason: 'Plan hash mismatch - plan may have been modified after approval',
      };
    }
  }

  // Check expiry
  if (approval.expiresAt) {
    const expiresAt = new Date(approval.expiresAt);
    const now = new Date();

    if (now >= expiresAt) {
      return {
        valid: false,
        reason: `Approval expired at ${approval.expiresAt}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if approval is about to expire (within threshold)
 */
export function isApprovalExpiringSoon(
  approval: ApprovalStatus,
  thresholdMinutes: number = 60
): boolean {
  if (!approval.expiresAt) {
    return false;
  }

  const expiresAt = new Date(approval.expiresAt);
  const threshold = new Date(Date.now() + thresholdMinutes * 60 * 1000);

  return expiresAt <= threshold;
}

/**
 * Get remaining approval time in minutes
 */
export function getApprovalRemainingMinutes(approval: ApprovalStatus): number | null {
  if (!approval.expiresAt) {
    return null;
  }

  const expiresAt = new Date(approval.expiresAt);
  const now = new Date();
  const remainingMs = expiresAt.getTime() - now.getTime();

  return Math.max(0, Math.floor(remainingMs / (60 * 1000)));
}

/**
 * Parse approval from GitHub issue comment
 */
export interface ParsedApproval {
  approved: boolean;
  approvedBy: string;
  planHash?: string;
  comment: string;
}

/**
 * Parse approval comment for plan hash binding
 */
export function parseApprovalComment(
  comment: string,
  author: string
): ParsedApproval | null {
  const lowerComment = comment.toLowerCase();

  // Check for approval
  if (!lowerComment.includes('approved') && !lowerComment.includes('lgtm')) {
    return null;
  }

  // Check for rejection
  if (lowerComment.includes('rejected') || lowerComment.includes('not approved')) {
    return null;
  }

  // Extract plan hash if present (format: plan-hash:abc123 or hash:abc123)
  const hashMatch = comment.match(/(?:plan-hash|hash):\s*([a-f0-9]{64})/i);

  return {
    approved: true,
    approvedBy: author,
    planHash: hashMatch ? hashMatch[1] : undefined,
    comment,
  };
}

/**
 * Format plan hash for display in approval request
 */
export function formatPlanHashForApproval(plan: ExecutionPlan): string {
  if (!plan.planHash) {
    return 'No plan hash available';
  }

  // Show first and last 8 characters
  const short = `${plan.planHash.substring(0, 8)}...${plan.planHash.substring(56)}`;

  return `Plan Hash: \`${short}\`\nFull Hash: \`${plan.planHash}\``;
}

/**
 * Generate approval request body for GitHub issue
 */
export function generateApprovalRequestBody(
  plan: ExecutionPlan,
  input: string,
  ttlHours?: number
): string {
  const ttl = ttlHours ?? getApprovalTtlHours();
  const hashInfo = formatPlanHashForApproval(plan);

  let body = `## Approval Required\n\n`;
  body += `**Input:** ${input}\n\n`;
  body += `**Risk Level:** ${plan.estimatedRisk}\n\n`;

  if (plan.approvalReason) {
    body += `**Reason:** ${plan.approvalReason}\n\n`;
  }

  body += `### Execution Plan\n\n`;
  body += `| Step | Action | Target | Risk |\n`;
  body += `|------|--------|--------|------|\n`;

  for (const step of plan.steps) {
    body += `| ${step.id} | ${step.action} | ${step.target || '-'} | ${step.risk} |\n`;
  }

  body += `\n### Approval Binding\n\n`;
  body += `${hashInfo}\n\n`;
  body += `**Approval TTL:** ${ttl} hours\n\n`;

  body += `### How to Approve\n\n`;
  body += `Comment with one of:\n`;
  body += `- \`approved\`\n`;
  body += `- \`LGTM\`\n`;
  body += `- \`approved plan-hash:${plan.planHash}\` (recommended for security)\n\n`;

  body += `⚠️ **Warning:** Approval will expire in ${ttl} hours.\n`;

  return body;
}
