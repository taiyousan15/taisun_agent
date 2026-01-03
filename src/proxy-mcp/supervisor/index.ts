/**
 * Supervisor Module - M6 (Updated P11)
 *
 * LangGraph-based supervisor with human approval and Issue logging.
 * Now includes approval binding with plan hash and TTL (P11).
 */

export { runSupervisor, resumeSupervisor, createSupervisorGraph } from './graph';
export { checkDangerousPatterns, requiresApproval, validatePlan } from './policy';
export {
  isGhAvailable,
  createRunlogIssue,
  createApprovalIssue,
  checkApproval,
  addIssueComment,
  closeIssue,
} from './github';
export {
  generatePlanHash,
  createExecutionPlanWithHash,
  createApprovalStatus,
  validateApproval,
  isApprovalExpiringSoon,
  getApprovalRemainingMinutes,
  parseApprovalComment,
  formatPlanHashForApproval,
  generateApprovalRequestBody,
  calculateApprovalExpiry,
} from './approve';
export type { ApprovalValidation, ParsedApproval } from './approve';
export type {
  SupervisorState,
  SupervisorStep,
  SupervisorOptions,
  SupervisorResult,
  RouteDecision,
  ExecutionPlan,
  PlanStep,
  ApprovalStatus,
  ExecutionResult,
} from './types';
export { DANGEROUS_PATTERNS } from './types';
