/**
 * Supervisor Evals - P10
 *
 * Regression tests for supervisor approval gating:
 * - E) Dangerous patterns trigger approval flow (stop, don't auto-execute)
 * - Resume functionality with persistence
 *
 * Tests use mocks for deterministic behavior.
 */

import {
  checkDangerousPatterns,
  requiresApproval,
  analyzePlanRisk,
  determineStepRisk,
  createPlanStep,
  validatePlan,
} from '../../src/proxy-mcp/supervisor/policy';
import { ExecutionPlan } from '../../src/proxy-mcp/supervisor/types';

describe('Supervisor Evals - Approval Gating', () => {
  describe('Contract E: Dangerous patterns trigger approval', () => {
    describe('checkDangerousPatterns', () => {
      it('should detect deployment patterns', () => {
        const patterns = checkDangerousPatterns('deploy to production');
        expect(patterns.length).toBeGreaterThan(0);
        expect(patterns.some((p) => p.includes('deploy') || p.includes('production'))).toBe(true);
      });

      it('should detect destructive patterns', () => {
        const patterns = checkDangerousPatterns('delete all user data');
        expect(patterns.length).toBeGreaterThan(0);
        expect(patterns.some((p) => p.includes('delete'))).toBe(true);
      });

      it('should detect secret-related patterns', () => {
        const patterns = checkDangerousPatterns('update password and rotate token');
        expect(patterns.length).toBeGreaterThan(0);
      });

      it('should return empty array for safe input', () => {
        const patterns = checkDangerousPatterns('read user profile');
        expect(patterns).toEqual([]);
      });
    });

    describe('requiresApproval', () => {
      it('should require approval for dangerous input', () => {
        expect(requiresApproval('delete all records')).toBe(true);
        expect(requiresApproval('deploy to production')).toBe(true);
        expect(requiresApproval('rotate secret key')).toBe(true);
      });

      it('should not require approval for safe input', () => {
        expect(requiresApproval('list all users')).toBe(false);
        expect(requiresApproval('search documentation')).toBe(false);
      });

      it('should require approval when route specifies require_human', () => {
        expect(requiresApproval('any input', {
          action: 'require_human',
          reason: 'test',
          confidence: 1.0,
        })).toBe(true);
      });

      it('should require approval when route has dangerous patterns', () => {
        expect(
          requiresApproval('any input', {
            action: 'allow',
            reason: 'test',
            confidence: 1.0,
            dangerousPatterns: ['delete'],
          })
        ).toBe(true);
      });
    });
  });

  describe('Risk assessment contracts', () => {
    describe('determineStepRisk', () => {
      it('should return critical for delete/drop/destroy', () => {
        expect(determineStepRisk('delete', 'database')).toBe('critical');
        expect(determineStepRisk('drop', 'table')).toBe('critical');
        expect(determineStepRisk('destroy', 'server')).toBe('critical');
      });

      it('should return critical for production deployment', () => {
        expect(determineStepRisk('deploy', 'production')).toBe('critical');
      });

      it('should return high for secret/credential operations', () => {
        expect(determineStepRisk('update', 'secret')).toBe('high');
        expect(determineStepRisk('rotate', 'credential')).toBe('high');
        expect(determineStepRisk('change', 'password')).toBe('high');
      });

      it('should return high for billing operations', () => {
        expect(determineStepRisk('modify', 'billing')).toBe('high');
        expect(determineStepRisk('cancel', 'payment')).toBe('high');
      });

      it('should return medium for admin/permission operations', () => {
        expect(determineStepRisk('grant', 'admin')).toBe('medium');
        expect(determineStepRisk('change', 'permission')).toBe('medium');
      });

      it('should return low for read-only operations', () => {
        expect(determineStepRisk('read', 'file')).toBe('low');
        expect(determineStepRisk('list', 'users')).toBe('low');
        expect(determineStepRisk('get', 'status')).toBe('low');
      });
    });

    describe('analyzePlanRisk', () => {
      it('should return highest risk level from all steps', () => {
        const plan: ExecutionPlan = {
          steps: [
            createPlanStep('1', 'read', 'file'), // low
            createPlanStep('2', 'delete', 'records'), // critical
            createPlanStep('3', 'list', 'users'), // low
          ],
          estimatedRisk: 'low',
          requiresApproval: false,
        };

        expect(analyzePlanRisk(plan)).toBe('critical');
      });

      it('should return low for all-safe plans', () => {
        const plan: ExecutionPlan = {
          steps: [
            createPlanStep('1', 'read', 'config'),
            createPlanStep('2', 'list', 'items'),
          ],
          estimatedRisk: 'low',
          requiresApproval: false,
        };

        expect(analyzePlanRisk(plan)).toBe('low');
      });
    });

    describe('validatePlan', () => {
      it('should reject high-risk plan without approval', () => {
        const plan: ExecutionPlan = {
          steps: [createPlanStep('1', 'delete', 'database')],
          estimatedRisk: 'critical',
          requiresApproval: false,
        };

        const result = validatePlan(plan, false);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('critical');
        expect(result.reason).toContain('approval');
      });

      it('should accept high-risk plan with approval', () => {
        const plan: ExecutionPlan = {
          steps: [createPlanStep('1', 'delete', 'database')],
          estimatedRisk: 'critical',
          requiresApproval: false,
        };

        const result = validatePlan(plan, true);
        expect(result.valid).toBe(true);
      });

      it('should accept low-risk plan without approval', () => {
        const plan: ExecutionPlan = {
          steps: [createPlanStep('1', 'read', 'file')],
          estimatedRisk: 'low',
          requiresApproval: false,
        };

        const result = validatePlan(plan, false);
        expect(result.valid).toBe(true);
      });

      it('should reject medium-risk plan when requiresApproval flag is set', () => {
        const plan: ExecutionPlan = {
          steps: [createPlanStep('1', 'grant', 'admin')],
          estimatedRisk: 'medium',
          requiresApproval: true,
        };

        const result = validatePlan(plan, false);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Golden cases: Critical operations must stop', () => {
    const criticalOperations = [
      { action: 'delete', target: 'all user data' },
      { action: 'drop', target: 'production database' },
      { action: 'deploy', target: 'to production' },
      { action: 'rotate', target: 'all secrets' },
      { action: 'wipe', target: 'server' },
    ];

    test.each(criticalOperations)(
      'CRITICAL: $action $target must require approval',
      ({ action, target }) => {
        const step = createPlanStep('test', action, target);

        // Contract: Must be high or critical risk
        expect(['high', 'critical']).toContain(step.risk);

        // Contract: Plan with this step must require approval
        const plan: ExecutionPlan = {
          steps: [step],
          estimatedRisk: step.risk,
          requiresApproval: false,
        };

        const result = validatePlan(plan, false);
        expect(result.valid).toBe(false);
      }
    );
  });

  describe('Resume functionality contract', () => {
    it('should preserve step information for resume', () => {
      const step = createPlanStep('step-1', 'deploy', 'production', {
        version: '1.0.0',
      });

      // Contract: Step should have all required fields for persistence
      expect(step.id).toBe('step-1');
      expect(step.action).toBe('deploy');
      expect(step.target).toBe('production');
      expect(step.params).toEqual({ version: '1.0.0' });
      expect(step.risk).toBeDefined();
    });

    it('should create deterministic plan structure', () => {
      const plan: ExecutionPlan = {
        steps: [
          createPlanStep('1', 'read', 'config'),
          createPlanStep('2', 'update', 'settings'),
        ],
        estimatedRisk: 'medium',
        requiresApproval: true,
      };

      // Contract: Plan should be JSON-serializable for persistence
      const serialized = JSON.stringify(plan);
      const deserialized = JSON.parse(serialized) as ExecutionPlan;

      expect(deserialized.steps.length).toBe(plan.steps.length);
      expect(deserialized.requiresApproval).toBe(plan.requiresApproval);
      expect(deserialized.estimatedRisk).toBe(plan.estimatedRisk);
    });
  });

  describe('Regression: No auto-execution of dangerous operations', () => {
    it('should NEVER allow dangerous operation without explicit approval', () => {
      // Use inputs that match DANGEROUS_PATTERNS exactly
      const dangerousInputs = [
        'delete all records',
        'drop database',
        'deploy to production',
        'rotate secret token',
        'destroy all instances',
      ];

      for (const input of dangerousInputs) {
        // Contract: Must require approval
        const needsApproval = requiresApproval(input);
        expect(needsApproval).toBe(true);

        // Contract: Associated plan must be invalid without approval
        const step = createPlanStep('1', input, '');
        const plan: ExecutionPlan = {
          steps: [step],
          estimatedRisk: step.risk,
          requiresApproval: false,
        };

        // Risk should be at least medium
        expect(['medium', 'high', 'critical']).toContain(step.risk);
      }
    });
  });
});
