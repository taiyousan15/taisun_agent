/**
 * Approval Binding Tests - P11
 *
 * Tests for plan hash and TTL-based approval validation.
 */

import {
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
} from '../../src/proxy-mcp/supervisor/approve';
import { PlanStep, ExecutionPlan, ApprovalStatus } from '../../src/proxy-mcp/supervisor/types';

describe('Approval Binding', () => {
  describe('generatePlanHash', () => {
    it('should generate a 64-character hex hash', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'read', target: 'file.txt', risk: 'low' },
      ];

      const hash = generatePlanHash(steps);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate consistent hash for same steps', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'read', target: 'file.txt', risk: 'low' },
      ];

      const hash1 = generatePlanHash(steps);
      const hash2 = generatePlanHash(steps);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different steps', () => {
      const steps1: PlanStep[] = [
        { id: 'step1', action: 'read', target: 'file.txt', risk: 'low' },
      ];
      const steps2: PlanStep[] = [
        { id: 'step1', action: 'write', target: 'file.txt', risk: 'medium' },
      ];

      const hash1 = generatePlanHash(steps1);
      const hash2 = generatePlanHash(steps2);

      expect(hash1).not.toBe(hash2);
    });

    it('should detect modified steps', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'delete', target: 'production', risk: 'critical' },
      ];

      const originalHash = generatePlanHash(steps);

      // Simulate attack: modify step after approval
      const modifiedSteps: PlanStep[] = [
        { id: 'step1', action: 'delete', target: 'all-data', risk: 'critical' },
      ];

      const modifiedHash = generatePlanHash(modifiedSteps);

      expect(originalHash).not.toBe(modifiedHash);
    });
  });

  describe('createExecutionPlanWithHash', () => {
    it('should create plan with hash', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];

      const plan = createExecutionPlanWithHash(steps, 'critical', true, 'Deployment');

      expect(plan.steps).toEqual(steps);
      expect(plan.estimatedRisk).toBe('critical');
      expect(plan.requiresApproval).toBe(true);
      expect(plan.approvalReason).toBe('Deployment');
      expect(plan.planHash).toHaveLength(64);
    });
  });

  describe('createApprovalStatus', () => {
    it('should create approval with plan hash and expiry', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true);

      const approval = createApprovalStatus(plan, 'admin', 'Approved for release');

      expect(approval.approved).toBe(true);
      expect(approval.approvedBy).toBe('admin');
      expect(approval.reason).toBe('Approved for release');
      expect(approval.approvedPlanHash).toBe(plan.planHash);
      expect(approval.expiresAt).toBeDefined();
      expect(new Date(approval.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('validateApproval', () => {
    it('should validate matching plan hash', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true);
      const approval = createApprovalStatus(plan, 'admin');

      const result = validateApproval(plan, approval);

      expect(result.valid).toBe(true);
    });

    it('should reject mismatched plan hash', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true);
      const approval = createApprovalStatus(plan, 'admin');

      // Create a different plan (simulating plan substitution attack)
      const differentSteps: PlanStep[] = [
        { id: 'step1', action: 'delete', target: 'all-data', risk: 'critical' },
      ];
      const differentPlan = createExecutionPlanWithHash(differentSteps, 'critical', true);

      // Try to use old approval with new plan
      const result = validateApproval(differentPlan, approval);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('hash mismatch');
    });

    it('should reject unapproved status', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true);
      const approval: ApprovalStatus = {
        required: true,
        approved: false,
      };

      const result = validateApproval(plan, approval);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not granted');
    });

    it('should reject expired approval', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true);

      // Create expired approval
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        approvedBy: 'admin',
        approvedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        approvedPlanHash: plan.planHash,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired yesterday
      };

      const result = validateApproval(plan, approval);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should require plan hash when policy mandates it', () => {
      const plan: ExecutionPlan = {
        steps: [{ id: 'step1', action: 'deploy', target: 'production', risk: 'critical' }],
        estimatedRisk: 'critical',
        requiresApproval: true,
        // No planHash
      };
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        approvedBy: 'admin',
      };

      const result = validateApproval(plan, approval);

      // Should fail because policy requires plan hash
      expect(result.valid).toBe(false);
    });
  });

  describe('isApprovalExpiringSoon', () => {
    it('should return true when expiring within threshold', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      };

      expect(isApprovalExpiringSoon(approval, 60)).toBe(true);
    });

    it('should return false when not expiring soon', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };

      expect(isApprovalExpiringSoon(approval, 60)).toBe(false);
    });

    it('should return false when no expiry set', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
      };

      expect(isApprovalExpiringSoon(approval)).toBe(false);
    });
  });

  describe('getApprovalRemainingMinutes', () => {
    it('should return remaining minutes', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      };

      const remaining = getApprovalRemainingMinutes(approval);

      expect(remaining).toBeGreaterThanOrEqual(119);
      expect(remaining).toBeLessThanOrEqual(121);
    });

    it('should return 0 for expired', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
      };

      const remaining = getApprovalRemainingMinutes(approval);

      expect(remaining).toBe(0);
    });

    it('should return null when no expiry', () => {
      const approval: ApprovalStatus = {
        required: true,
        approved: true,
      };

      expect(getApprovalRemainingMinutes(approval)).toBeNull();
    });
  });

  describe('parseApprovalComment', () => {
    it('should parse simple approval', () => {
      const result = parseApprovalComment('approved', 'admin');

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(true);
      expect(result?.approvedBy).toBe('admin');
    });

    it('should parse LGTM', () => {
      const result = parseApprovalComment('LGTM, looks good to me', 'reviewer');

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(true);
      expect(result?.approvedBy).toBe('reviewer');
    });

    it('should extract plan hash', () => {
      const hash = 'a'.repeat(64);
      const result = parseApprovalComment(`approved plan-hash:${hash}`, 'admin');

      expect(result).not.toBeNull();
      expect(result?.planHash).toBe(hash);
    });

    it('should return null for rejection', () => {
      const result = parseApprovalComment('not approved, needs changes', 'admin');

      expect(result).toBeNull();
    });

    it('should return null for non-approval comment', () => {
      const result = parseApprovalComment('I have a question about this', 'user');

      expect(result).toBeNull();
    });
  });

  describe('formatPlanHashForApproval', () => {
    it('should format hash for display', () => {
      const plan: ExecutionPlan = {
        steps: [],
        estimatedRisk: 'low',
        requiresApproval: false,
        planHash: 'a'.repeat(64),
      };

      const formatted = formatPlanHashForApproval(plan);

      expect(formatted).toContain('aaaaaaaa...aaaaaaaa');
      expect(formatted).toContain('a'.repeat(64));
    });

    it('should handle missing hash', () => {
      const plan: ExecutionPlan = {
        steps: [],
        estimatedRisk: 'low',
        requiresApproval: false,
      };

      const formatted = formatPlanHashForApproval(plan);

      expect(formatted).toContain('No plan hash');
    });
  });

  describe('generateApprovalRequestBody', () => {
    it('should generate formatted approval request', () => {
      const steps: PlanStep[] = [
        { id: 'step1', action: 'deploy', target: 'production', risk: 'critical' },
      ];
      const plan = createExecutionPlanWithHash(steps, 'critical', true, 'Production deployment');

      const body = generateApprovalRequestBody(plan, 'Deploy v1.0.0');

      expect(body).toContain('Approval Required');
      expect(body).toContain('Deploy v1.0.0');
      expect(body).toContain('critical');
      expect(body).toContain('Production deployment');
      expect(body).toContain('deploy');
      expect(body).toContain('production');
      expect(body).toContain('Plan Hash');
      expect(body).toContain('24 hours');
    });
  });

  describe('calculateApprovalExpiry', () => {
    it('should calculate expiry based on policy TTL', () => {
      const expiry = calculateApprovalExpiry();
      const expiryDate = new Date(expiry);
      const now = new Date();

      // Should be approximately 24 hours in the future (default TTL)
      const hoursDiff = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      expect(hoursDiff).toBeGreaterThanOrEqual(23);
      expect(hoursDiff).toBeLessThanOrEqual(25);
    });
  });
});

describe('Plan Substitution Attack Prevention', () => {
  it('should prevent plan substitution attack', () => {
    // Original plan that gets approved
    const originalSteps: PlanStep[] = [
      { id: 'step1', action: 'read', target: 'config.json', risk: 'low' },
    ];
    const originalPlan = createExecutionPlanWithHash(originalSteps, 'low', true);
    const approval = createApprovalStatus(originalPlan, 'admin');

    // Attacker tries to substitute with malicious plan
    const maliciousSteps: PlanStep[] = [
      { id: 'step1', action: 'delete', target: 'production-database', risk: 'critical' },
    ];
    const maliciousPlan = createExecutionPlanWithHash(maliciousSteps, 'critical', true);

    // Validation should fail
    const result = validateApproval(maliciousPlan, approval);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('hash mismatch');
  });

  it('should prevent step modification attack', () => {
    // Approved plan
    const steps: PlanStep[] = [
      { id: 'step1', action: 'update', target: 'staging', risk: 'medium' },
    ];
    const plan = createExecutionPlanWithHash(steps, 'medium', true);
    const approval = createApprovalStatus(plan, 'admin');

    // Modify the plan after approval
    plan.steps[0].target = 'production';
    plan.planHash = generatePlanHash(plan.steps); // Recalculate hash

    // Validation should fail because approval was for different hash
    const result = validateApproval(plan, approval);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('hash mismatch');
  });
});
