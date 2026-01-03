/**
 * Policy Loader - P11
 *
 * Loads and validates policy configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PolicyConfig,
  PolicyEvaluation,
  SafetyRuleConfig,
  PolicyOverride,
  PolicyAction,
  RiskLevel,
} from './types';

const POLICY_PATH = path.join(process.cwd(), 'config', 'proxy-mcp', 'policy.json');

let cachedPolicy: PolicyConfig | null = null;
let cacheTime: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Load policy configuration from file
 */
export function loadPolicy(): PolicyConfig {
  const now = Date.now();

  // Return cached policy if still valid
  if (cachedPolicy && now - cacheTime < CACHE_TTL_MS) {
    return cachedPolicy;
  }

  try {
    if (fs.existsSync(POLICY_PATH)) {
      const content = fs.readFileSync(POLICY_PATH, 'utf-8');
      const policy = JSON.parse(content) as PolicyConfig;

      // Validate basic structure
      if (!policy.version || !policy.safetyRules || !policy.defaults) {
        throw new Error('Invalid policy structure');
      }

      cachedPolicy = policy;
      cacheTime = now;
      return policy;
    }
  } catch (error) {
    console.error('[Policy] Failed to load policy:', error);
  }

  // Return default policy
  return getDefaultPolicy();
}

/**
 * Clear policy cache (for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
  cacheTime = 0;
}

/**
 * Get default policy configuration
 */
export function getDefaultPolicy(): PolicyConfig {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    safetyRules: [
      {
        category: 'deployment',
        description: 'Production deployment operations',
        keywords: ['deploy', 'production', 'release', 'publish', 'rollout'],
        patterns: ['deploy\\s+to\\s+prod', 'push\\s+to\\s+production'],
        action: 'require_human',
        riskLevel: 'critical',
      },
      {
        category: 'destructive',
        description: 'Data deletion operations',
        keywords: ['delete', 'drop', 'truncate', 'destroy', 'wipe'],
        patterns: ['drop\\s+table', 'delete\\s+all', 'rm\\s+-rf'],
        action: 'require_human',
        riskLevel: 'critical',
      },
      {
        category: 'secrets',
        description: 'Secret/credential operations',
        keywords: ['secret', 'credential', 'password', 'token', 'api_key'],
        patterns: ['rotate\\s+(secret|key|token)'],
        action: 'require_human',
        riskLevel: 'high',
      },
      {
        category: 'billing',
        description: 'Billing/payment operations',
        keywords: ['billing', 'payment', 'invoice', 'subscription'],
        patterns: ['cancel\\s+subscription', 'change\\s+plan'],
        action: 'require_human',
        riskLevel: 'high',
      },
      {
        category: 'access_control',
        description: 'Access control operations',
        keywords: ['permission', 'role', 'admin', 'sudo'],
        patterns: ['grant\\s+admin', 'change\\s+role'],
        action: 'require_human',
        riskLevel: 'medium',
      },
      {
        category: 'automation_abuse',
        description: 'Automation abuse patterns',
        keywords: ['captcha', 'bypass', 'scrape', 'spam'],
        patterns: ['bypass\\s+captcha', 'mass\\s+scrape'],
        action: 'deny',
        riskLevel: 'critical',
      },
    ],
    dangerousPatterns: {
      critical: ['deploy', 'production', 'delete', 'drop', 'destroy', 'wipe'],
      high: ['secret', 'credential', 'password', 'token', 'billing', 'payment'],
      medium: ['admin', 'role', 'permission'],
    },
    overrides: [],
    defaults: {
      defaultAction: 'allow',
      approvalTtlHours: 24,
      requirePlanHash: true,
    },
  };
}

/**
 * Check if an override is still valid (not expired)
 */
export function isOverrideValid(override: PolicyOverride): boolean {
  const now = new Date();
  const expiresAt = new Date(override.expiresAt);
  return now < expiresAt;
}

/**
 * Get valid overrides for a category
 */
export function getValidOverrides(category: string): PolicyOverride[] {
  const policy = loadPolicy();
  return policy.overrides.filter(
    (o) => o.targetCategory === category && isOverrideValid(o)
  );
}

/**
 * Evaluate policy against input
 */
export function evaluatePolicy(input: string): PolicyEvaluation {
  const policy = loadPolicy();
  const inputLower = input.toLowerCase();

  let matchedRule: SafetyRuleConfig | null = null;
  let matchedBy: string | null = null;
  let highestPriorityAction: PolicyAction = policy.defaults.defaultAction;

  // Priority order: deny > require_human > allow
  const actionPriority: Record<PolicyAction, number> = {
    deny: 3,
    require_human: 2,
    allow: 1,
  };

  for (const rule of policy.safetyRules) {
    // Check keywords
    for (const keyword of rule.keywords) {
      if (inputLower.includes(keyword.toLowerCase())) {
        if (actionPriority[rule.action] > actionPriority[highestPriorityAction]) {
          highestPriorityAction = rule.action;
          matchedRule = rule;
          matchedBy = `keyword: ${keyword}`;

          // Deny is highest priority, no need to continue
          if (rule.action === 'deny') {
            break;
          }
        }
      }
    }

    if (highestPriorityAction === 'deny') break;

    // Check patterns
    for (const patternStr of rule.patterns) {
      try {
        const pattern = new RegExp(patternStr, 'i');
        if (pattern.test(input)) {
          if (actionPriority[rule.action] > actionPriority[highestPriorityAction]) {
            highestPriorityAction = rule.action;
            matchedRule = rule;
            matchedBy = `pattern: ${patternStr}`;

            if (rule.action === 'deny') {
              break;
            }
          }
        }
      } catch {
        // Skip invalid regex
      }
    }

    if (highestPriorityAction === 'deny') break;
  }

  // Check for overrides
  let overrideApplied: PolicyEvaluation['overrideApplied'];
  if (matchedRule) {
    const overrides = getValidOverrides(matchedRule.category);
    if (overrides.length > 0) {
      // Apply the first valid override (could add more complex logic)
      const override = overrides[0];
      if (actionPriority[override.action] < actionPriority[highestPriorityAction]) {
        highestPriorityAction = override.action;
        overrideApplied = {
          id: override.id,
          reason: override.reason,
        };
      }
    }
  }

  return {
    action: highestPriorityAction,
    matchedCategory: matchedRule?.category,
    matchedBy: matchedBy || undefined,
    riskLevel: matchedRule?.riskLevel || 'low',
    reason: matchedRule
      ? `Safety rule [${matchedRule.category}]: ${matchedBy}`
      : 'No safety rule matched',
    overrideApplied,
  };
}

/**
 * Get dangerous patterns by risk level
 */
export function getDangerousPatterns(): {
  critical: string[];
  high: string[];
  medium: string[];
  all: string[];
} {
  const policy = loadPolicy();
  return {
    critical: policy.dangerousPatterns.critical,
    high: policy.dangerousPatterns.high,
    medium: policy.dangerousPatterns.medium,
    all: [
      ...policy.dangerousPatterns.critical,
      ...policy.dangerousPatterns.high,
      ...policy.dangerousPatterns.medium,
    ],
  };
}

/**
 * Get approval TTL from policy
 */
export function getApprovalTtlHours(): number {
  const policy = loadPolicy();
  return policy.defaults.approvalTtlHours;
}

/**
 * Check if plan hash is required for approvals
 */
export function requiresPlanHash(): boolean {
  const policy = loadPolicy();
  return policy.defaults.requirePlanHash;
}

/**
 * Get all safety categories
 */
export function getSafetyCategories(): string[] {
  const policy = loadPolicy();
  return policy.safetyRules.map((r) => r.category);
}

/**
 * Determine risk level from input
 */
export function determineRiskLevel(input: string): RiskLevel {
  const inputLower = input.toLowerCase();
  const patterns = getDangerousPatterns();

  for (const pattern of patterns.critical) {
    if (inputLower.includes(pattern.toLowerCase())) {
      return 'critical';
    }
  }

  for (const pattern of patterns.high) {
    if (inputLower.includes(pattern.toLowerCase())) {
      return 'high';
    }
  }

  for (const pattern of patterns.medium) {
    if (inputLower.includes(pattern.toLowerCase())) {
      return 'medium';
    }
  }

  return 'low';
}
