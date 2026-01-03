/**
 * Policy Types - P11
 *
 * Types for policy-as-code configuration.
 */

/**
 * Policy action types
 */
export type PolicyAction = 'allow' | 'require_human' | 'deny';

/**
 * Risk level for operations
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Safety rule category
 */
export interface SafetyRuleConfig {
  /** Unique identifier for the category */
  category: string;
  /** Description for human understanding */
  description: string;
  /** Keywords that trigger this rule (case-insensitive) */
  keywords: string[];
  /** Regex patterns that trigger this rule */
  patterns: string[];
  /** Action to take when matched */
  action: PolicyAction;
  /** Default risk level for this category */
  riskLevel: RiskLevel;
}

/**
 * Policy override for temporary exceptions
 */
export interface PolicyOverride {
  /** Unique identifier for the override */
  id: string;
  /** Which category/rule to override */
  targetCategory: string;
  /** Override action (must be less restrictive) */
  action: PolicyAction;
  /** Reason for the override */
  reason: string;
  /** Who approved this override */
  approvedBy: string;
  /** When the override was created */
  createdAt: string;
  /** When the override expires (ISO date string) */
  expiresAt: string;
  /** Optional scope restriction (e.g., specific MCP, user) */
  scope?: {
    mcp?: string[];
    users?: string[];
    patterns?: string[];
  };
}

/**
 * Full policy configuration
 */
export interface PolicyConfig {
  /** Policy version */
  version: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Safety rules by category */
  safetyRules: SafetyRuleConfig[];
  /** Dangerous patterns for supervisor */
  dangerousPatterns: {
    /** Patterns that trigger critical risk */
    critical: string[];
    /** Patterns that trigger high risk */
    high: string[];
    /** Patterns that trigger medium risk */
    medium: string[];
  };
  /** Temporary overrides */
  overrides: PolicyOverride[];
  /** Default settings */
  defaults: {
    /** Default action when no rule matches */
    defaultAction: PolicyAction;
    /** Approval TTL in hours */
    approvalTtlHours: number;
    /** Whether to require plan hash for approvals */
    requirePlanHash: boolean;
  };
}

/**
 * Evaluated policy result
 */
export interface PolicyEvaluation {
  /** Final action after evaluation */
  action: PolicyAction;
  /** Category that matched (if any) */
  matchedCategory?: string;
  /** Matched keyword or pattern */
  matchedBy?: string;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Human-readable reason */
  reason: string;
  /** Whether an override was applied */
  overrideApplied?: {
    id: string;
    reason: string;
  };
}
