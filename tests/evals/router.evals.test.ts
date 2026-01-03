/**
 * Router Evals - P10
 *
 * Regression tests for router safety classification:
 * - D) deployment/destructive/secrets/billing/access_control → require_human
 * - automation_abuse → deny
 *
 * Golden cases ensure dangerous operations are always flagged.
 */

import {
  evaluateSafetyRules,
  isDangerousOperation,
  getSafetyCategories,
  SAFETY_RULES,
} from '../../src/proxy-mcp/router/rules';
import * as fs from 'fs';
import * as path from 'path';

describe('Router Evals - Safety Classification', () => {
  describe('Contract D: Dangerous categories require_human', () => {
    const dangerousCategories = [
      'deployment',
      'destructive',
      'secrets',
      'billing',
      'access_control',
    ];

    it('should have all dangerous categories defined in SAFETY_RULES', () => {
      const categories = getSafetyCategories();
      for (const cat of dangerousCategories) {
        expect(categories).toContain(cat);
      }
    });

    describe('deployment category', () => {
      const deploymentInputs = [
        'deploy to prod',
        'push to production',
        'release v1.0',
        'rollout new version',
        'publish to production',
      ];

      test.each(deploymentInputs)('should require_human for: %s', (input) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.action).toBe('require_human');
        expect(result?.matchedRule).toBe('deployment');
      });
    });

    describe('destructive category', () => {
      const destructiveInputs = [
        'delete all records',
        'drop table users',
        'truncate table data',
        'rm -rf /var/data',
        'destroy all instances',
        'wipe the database',
      ];

      test.each(destructiveInputs)('should require_human for: %s', (input) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.action).toBe('require_human');
        expect(result?.matchedRule).toBe('destructive');
      });
    });

    describe('secrets category', () => {
      const secretsInputs = [
        'rotate secret key',
        'update credential',
        'change password',
        'regenerate api_key',
        'rotate token',
      ];

      test.each(secretsInputs)('should require_human for: %s', (input) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.action).toBe('require_human');
        expect(result?.matchedRule).toBe('secrets');
      });
    });

    describe('billing category', () => {
      const billingInputs = [
        'cancel subscription',
        'change plan',
        'update billing info',
        'process payment',
        'modify invoice',
      ];

      test.each(billingInputs)('should require_human for: %s', (input) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.action).toBe('require_human');
        expect(result?.matchedRule).toBe('billing');
      });
    });

    describe('access_control category', () => {
      const accessControlInputs = [
        'grant admin access',
        'change role',
        'elevate privilege',
        'modify permission',
        'sudo command',
      ];

      test.each(accessControlInputs)('should require_human for: %s', (input) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.action).toBe('require_human');
        expect(result?.matchedRule).toBe('access_control');
      });
    });
  });

  describe('automation_abuse category (deny)', () => {
    const abuseInputs = [
      'bypass captcha',
      'mass scrape website',
      'automated login',
      'flood the server',
      'spam messages',
    ];

    test.each(abuseInputs)('should deny for: %s', (input) => {
      const result = evaluateSafetyRules(input);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('deny');
      expect(result?.matchedRule).toBe('automation_abuse');
    });

    it('should prioritize deny over require_human', () => {
      // Input that matches both automation_abuse and another category
      const input = 'bypass captcha and deploy to production';
      const result = evaluateSafetyRules(input);

      // Deny should take precedence
      expect(result?.action).toBe('deny');
    });
  });

  describe('Safe inputs (no action)', () => {
    const safeInputs = [
      'read user profile',
      'fetch documentation',
      'list available options',
      'search for records',
      'view dashboard',
      'get status',
    ];

    test.each(safeInputs)('should return null for safe input: %s', (input) => {
      const result = evaluateSafetyRules(input);
      expect(result).toBeNull();
    });
  });

  describe('Golden Case: URL fixtures', () => {
    const fixturesDir = path.join(__dirname, '../fixtures/evals');

    it('should classify internal/admin URLs as dangerous', () => {
      const internalFixture = fs.readFileSync(
        path.join(fixturesDir, 'urls_internal.txt'),
        'utf-8'
      );

      const urls = internalFixture
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'));

      // At least some URLs should trigger safety rules
      const results = urls.map((url) => ({
        url,
        result: evaluateSafetyRules(url),
      }));

      const dangerous = results.filter((r) => r.result !== null);

      // Contract: Internal/admin URLs should be flagged
      expect(dangerous.length).toBeGreaterThan(0);

      // All flagged should be require_human or deny
      for (const { result } of dangerous) {
        expect(['require_human', 'deny']).toContain(result?.action);
      }
    });

    it('should classify docs URLs as safe', () => {
      const docsFixture = fs.readFileSync(
        path.join(fixturesDir, 'urls_docs.txt'),
        'utf-8'
      );

      const urls = docsFixture
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'));

      // Docs URLs should generally be safe
      const results = urls.map((url) => ({
        url,
        result: evaluateSafetyRules(url),
      }));

      const dangerous = results.filter((r) => r.result !== null);

      // Contract: Most docs URLs should be safe (allow some false positives)
      const safeRatio = (urls.length - dangerous.length) / urls.length;
      expect(safeRatio).toBeGreaterThan(0.5);
    });
  });

  describe('isDangerousOperation helper', () => {
    it('should detect dangerous operations in MCP context', () => {
      expect(isDangerousOperation('database-mcp', 'drop_table', ['drop', 'delete'])).toBe(true);
      expect(isDangerousOperation('database-mcp', 'select_all', ['drop', 'delete'])).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isDangerousOperation('mcp', 'DROP_TABLE', ['drop'])).toBe(true);
      expect(isDangerousOperation('mcp', 'Drop_Table', ['drop'])).toBe(true);
    });
  });

  describe('Regression: No false negatives for critical patterns', () => {
    // These patterns MUST always be caught
    const criticalPatterns = [
      { input: 'rm -rf /', expected: 'destructive' },
      { input: 'drop table users', expected: 'destructive' },
      { input: 'deploy to production now', expected: 'deployment' },
      { input: 'rotate secret key', expected: 'secrets' },
      { input: 'grant root access', expected: 'access_control' },
    ];

    test.each(criticalPatterns)(
      'CRITICAL: must catch "$input"',
      ({ input, expected }) => {
        const result = evaluateSafetyRules(input);
        expect(result).not.toBeNull();
        expect(result?.matchedRule).toBe(expected);
      }
    );
  });
});
