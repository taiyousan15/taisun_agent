/**
 * Rules Router - Pattern-based routing with safety rules
 *
 * Priority order:
 * 1. Deny rules (highest priority - block immediately)
 * 2. Require human rules (dangerous operations)
 * 3. Allow rules (explicitly permitted)
 *
 * Rules are now loaded from config/proxy-mcp/policy.json (P11).
 */

import { RouteAction, RouteResult, SafetyRule } from './types';
import { loadPolicy, evaluatePolicy as evaluatePolicyConfig } from '../policy';

/**
 * Build SAFETY_RULES from policy config
 */
function buildSafetyRules(): SafetyRule[] {
  const policy = loadPolicy();
  return policy.safetyRules.map((rule) => ({
    category: rule.category,
    keywords: rule.keywords,
    patterns: rule.patterns.map((p) => new RegExp(p, 'i')),
    action: rule.action as RouteAction,
  }));
}

// Cache for compiled rules
let cachedRules: SafetyRule[] | null = null;

/**
 * Get safety rules (cached)
 */
function getSafetyRules(): SafetyRule[] {
  if (!cachedRules) {
    cachedRules = buildSafetyRules();
  }
  return cachedRules;
}

/**
 * Clear cached rules (for testing)
 */
export function clearRulesCache(): void {
  cachedRules = null;
}

// Export for backwards compatibility (used by tests)
export const SAFETY_RULES: SafetyRule[] = buildSafetyRules();

/**
 * Check if input matches any keyword
 */
function matchesKeywords(input: string, keywords: string[]): string | null {
  const inputLower = input.toLowerCase();
  for (const keyword of keywords) {
    if (inputLower.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

/**
 * Check if input matches any pattern
 */
function matchesPatterns(input: string, patterns: RegExp[]): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(input)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Evaluate safety rules against input
 * Returns the most restrictive matching rule
 */
export function evaluateSafetyRules(input: string): RouteResult | null {
  let result: RouteResult | null = null;
  const rules = getSafetyRules();

  for (const rule of rules) {
    // Check keywords
    const matchedKeyword = matchesKeywords(input, rule.keywords);
    if (matchedKeyword) {
      const newResult: RouteResult = {
        action: rule.action,
        reason: `Safety rule [${rule.category}]: matched keyword "${matchedKeyword}"`,
        matchedRule: rule.category,
      };

      // Deny takes precedence over require_human
      if (rule.action === 'deny') {
        return newResult;
      }

      // Keep the first require_human match
      if (!result) {
        result = newResult;
      }
    }

    // Check patterns
    const matchedPattern = matchesPatterns(input, rule.patterns);
    if (matchedPattern) {
      const newResult: RouteResult = {
        action: rule.action,
        reason: `Safety rule [${rule.category}]: matched pattern "${matchedPattern.source}"`,
        matchedRule: rule.category,
      };

      if (rule.action === 'deny') {
        return newResult;
      }

      if (!result) {
        result = newResult;
      }
    }
  }

  return result;
}

/**
 * Check if a specific MCP operation is dangerous
 */
export function isDangerousOperation(
  mcpName: string,
  operation: string,
  dangerousOps: string[]
): boolean {
  const opLower = operation.toLowerCase();
  return dangerousOps.some((dangerousOp) => opLower.includes(dangerousOp.toLowerCase()));
}

/**
 * Get all safety rule categories
 */
export function getSafetyCategories(): string[] {
  return getSafetyRules().map((rule) => rule.category);
}
