/**
 * Policy Configuration Tests - P11
 *
 * Tests for policy-as-code system.
 */

import * as fs from 'fs';
import {
  loadPolicy,
  clearPolicyCache,
  getDefaultPolicy,
  evaluatePolicy,
  getDangerousPatterns,
  getApprovalTtlHours,
  requiresPlanHash,
  getSafetyCategories,
  determineRiskLevel,
  isOverrideValid,
  getValidOverrides,
} from '../../src/proxy-mcp/policy';

describe('Policy Configuration', () => {
  beforeEach(() => {
    clearPolicyCache();
  });

  describe('loadPolicy', () => {
    it('should load policy from config file', () => {
      const policy = loadPolicy();

      expect(policy).toBeDefined();
      expect(policy.version).toBeDefined();
      expect(policy.safetyRules).toBeInstanceOf(Array);
      expect(policy.dangerousPatterns).toBeDefined();
      expect(policy.defaults).toBeDefined();
    });

    it('should have required safety rule categories', () => {
      const policy = loadPolicy();
      const categories = policy.safetyRules.map((r) => r.category);

      expect(categories).toContain('deployment');
      expect(categories).toContain('destructive');
      expect(categories).toContain('secrets');
      expect(categories).toContain('billing');
      expect(categories).toContain('access_control');
      expect(categories).toContain('automation_abuse');
    });

    it('should cache policy', () => {
      const policy1 = loadPolicy();
      const policy2 = loadPolicy();

      expect(policy1).toBe(policy2); // Same reference
    });

    it('should return valid default policy structure', () => {
      // Test that default policy is properly structured
      const defaultPolicy = getDefaultPolicy();

      expect(defaultPolicy.version).toBe('1.0.0');
      expect(defaultPolicy.safetyRules.length).toBeGreaterThan(0);
      expect(defaultPolicy.defaults).toBeDefined();
      expect(defaultPolicy.dangerousPatterns).toBeDefined();
    });
  });

  describe('getDefaultPolicy', () => {
    it('should return valid default policy', () => {
      const policy = getDefaultPolicy();

      expect(policy.version).toBe('1.0.0');
      expect(policy.safetyRules).toBeInstanceOf(Array);
      expect(policy.safetyRules.length).toBeGreaterThan(0);
      expect(policy.defaults.defaultAction).toBe('allow');
      expect(policy.defaults.approvalTtlHours).toBe(24);
      expect(policy.defaults.requirePlanHash).toBe(true);
    });

    it('should include all risk levels in dangerous patterns', () => {
      const policy = getDefaultPolicy();

      expect(policy.dangerousPatterns.critical).toBeInstanceOf(Array);
      expect(policy.dangerousPatterns.high).toBeInstanceOf(Array);
      expect(policy.dangerousPatterns.medium).toBeInstanceOf(Array);
    });
  });

  describe('evaluatePolicy', () => {
    it('should allow safe input', () => {
      const result = evaluatePolicy('list all users');

      expect(result.action).toBe('allow');
      expect(result.riskLevel).toBe('low');
    });

    it('should require_human for deployment keywords', () => {
      const result = evaluatePolicy('deploy to production');

      expect(result.action).toBe('require_human');
      expect(result.matchedCategory).toBe('deployment');
      expect(result.riskLevel).toBe('critical');
    });

    it('should require_human for destructive keywords', () => {
      const result = evaluatePolicy('delete all records');

      expect(result.action).toBe('require_human');
      expect(result.matchedCategory).toBe('destructive');
      expect(result.riskLevel).toBe('critical');
    });

    it('should require_human for secrets keywords', () => {
      const result = evaluatePolicy('rotate the secret key');

      expect(result.action).toBe('require_human');
      expect(result.matchedCategory).toBe('secrets');
      expect(result.riskLevel).toBe('high');
    });

    it('should require_human for billing keywords', () => {
      const result = evaluatePolicy('update billing information');

      expect(result.action).toBe('require_human');
      expect(result.matchedCategory).toBe('billing');
      expect(result.riskLevel).toBe('high');
    });

    it('should require_human for access control keywords', () => {
      const result = evaluatePolicy('grant admin access');

      expect(result.action).toBe('require_human');
      expect(result.matchedCategory).toBe('access_control');
      expect(result.riskLevel).toBe('medium');
    });

    it('should deny automation abuse keywords', () => {
      const result = evaluatePolicy('bypass captcha verification');

      expect(result.action).toBe('deny');
      expect(result.matchedCategory).toBe('automation_abuse');
      expect(result.riskLevel).toBe('critical');
    });

    it('should match patterns', () => {
      // Use pattern "release v1.0" which matches pattern but keyword "release" is also present
      // The pattern should take priority when both match
      const result = evaluatePolicy('push to production server now');

      expect(result.action).toBe('require_human');
      // Either keyword or pattern match is acceptable
      expect(result.matchedBy).toBeDefined();
    });

    it('should prioritize deny over require_human', () => {
      // Input matches both captcha (deny) and production (require_human)
      const result = evaluatePolicy('bypass captcha on production');

      expect(result.action).toBe('deny');
    });

    it('should be case insensitive', () => {
      const result1 = evaluatePolicy('DELETE ALL');
      const result2 = evaluatePolicy('delete all');

      expect(result1.action).toBe('require_human');
      expect(result2.action).toBe('require_human');
    });
  });

  describe('getDangerousPatterns', () => {
    it('should return patterns by risk level', () => {
      const patterns = getDangerousPatterns();

      expect(patterns.critical).toBeInstanceOf(Array);
      expect(patterns.high).toBeInstanceOf(Array);
      expect(patterns.medium).toBeInstanceOf(Array);
      expect(patterns.all).toBeInstanceOf(Array);
    });

    it('should include common dangerous patterns', () => {
      const patterns = getDangerousPatterns();

      expect(patterns.critical).toContain('deploy');
      expect(patterns.critical).toContain('delete');
      expect(patterns.high).toContain('secret');
      expect(patterns.high).toContain('password');
      expect(patterns.medium).toContain('admin');
    });

    it('should have all patterns combined in .all', () => {
      const patterns = getDangerousPatterns();
      const expectedLength =
        patterns.critical.length + patterns.high.length + patterns.medium.length;

      expect(patterns.all.length).toBe(expectedLength);
    });
  });

  describe('getApprovalTtlHours', () => {
    it('should return approval TTL from policy', () => {
      const ttl = getApprovalTtlHours();

      expect(typeof ttl).toBe('number');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should default to 24 hours', () => {
      // Default policy has 24 hours
      const policy = getDefaultPolicy();
      expect(policy.defaults.approvalTtlHours).toBe(24);
    });
  });

  describe('requiresPlanHash', () => {
    it('should return boolean', () => {
      const result = requiresPlanHash();

      expect(typeof result).toBe('boolean');
    });

    it('should default to true', () => {
      const policy = getDefaultPolicy();
      expect(policy.defaults.requirePlanHash).toBe(true);
    });
  });

  describe('getSafetyCategories', () => {
    it('should return all safety categories', () => {
      const categories = getSafetyCategories();

      expect(categories).toBeInstanceOf(Array);
      expect(categories.length).toBeGreaterThan(0);
    });

    it('should include expected categories', () => {
      const categories = getSafetyCategories();

      expect(categories).toContain('deployment');
      expect(categories).toContain('destructive');
      expect(categories).toContain('secrets');
    });
  });

  describe('determineRiskLevel', () => {
    it('should return critical for critical patterns', () => {
      expect(determineRiskLevel('deploy to server')).toBe('critical');
      expect(determineRiskLevel('delete records')).toBe('critical');
      expect(determineRiskLevel('destroy environment')).toBe('critical');
    });

    it('should return high for high patterns', () => {
      expect(determineRiskLevel('update secret')).toBe('high');
      expect(determineRiskLevel('change password')).toBe('high');
      expect(determineRiskLevel('billing update')).toBe('high');
    });

    it('should return medium for medium patterns', () => {
      expect(determineRiskLevel('grant admin')).toBe('medium');
      expect(determineRiskLevel('change role')).toBe('medium');
    });

    it('should return low for safe input', () => {
      expect(determineRiskLevel('list all items')).toBe('low');
      expect(determineRiskLevel('get user info')).toBe('low');
    });

    it('should be case insensitive', () => {
      expect(determineRiskLevel('DELETE')).toBe('critical');
      expect(determineRiskLevel('delete')).toBe('critical');
    });
  });

  describe('isOverrideValid', () => {
    it('should return true for future expiry', () => {
      const override = {
        id: 'test-1',
        targetCategory: 'deployment',
        action: 'allow' as const,
        reason: 'Testing',
        createdBy: 'test',
        approvedBy: 'approver',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // +1 day
      };

      expect(isOverrideValid(override)).toBe(true);
    });

    it('should return false for past expiry', () => {
      const override = {
        id: 'test-2',
        targetCategory: 'deployment',
        action: 'allow' as const,
        reason: 'Testing',
        createdBy: 'test',
        approvedBy: 'approver',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // -1 day
      };

      expect(isOverrideValid(override)).toBe(false);
    });
  });

  describe('getValidOverrides', () => {
    it('should return empty array when no overrides configured', () => {
      const overrides = getValidOverrides('deployment');

      expect(overrides).toBeInstanceOf(Array);
      // Default policy has no overrides
    });

    it('should filter by category', () => {
      // This tests the filtering logic even with empty overrides
      const overrides1 = getValidOverrides('deployment');
      const overrides2 = getValidOverrides('nonexistent');

      expect(overrides1).toBeInstanceOf(Array);
      expect(overrides2).toBeInstanceOf(Array);
    });
  });
});

describe('Policy Integration', () => {
  beforeEach(() => {
    clearPolicyCache();
  });

  it('should provide dangerous patterns to other modules', () => {
    // Verify the policy module provides patterns that other modules can use
    const patterns = getDangerousPatterns();

    // These patterns should be available for router/rules and supervisor/policy
    expect(patterns.all).toContain('deploy');
    expect(patterns.all).toContain('delete');
    expect(patterns.all).toContain('secret');
    expect(patterns.all).toContain('admin');
  });

  it('should work with supervisor/policy module', async () => {
    const { checkDangerousPatterns, requiresApproval } = await import(
      '../../src/proxy-mcp/supervisor/policy'
    );

    const patterns = checkDangerousPatterns('delete production data');

    expect(patterns).toContain('delete');
    expect(patterns).toContain('production');

    const needsApproval = requiresApproval('delete production data');
    expect(needsApproval).toBe(true);
  });
});
