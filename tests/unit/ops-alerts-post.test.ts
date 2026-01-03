/**
 * Alert Posting Tests - P14
 */

import {
  postAlert,
  shouldPostAlert,
  createMockGitHubAlertAPI,
  AlertPostConfig,
  DEFAULT_ALERT_CONFIG,
  SLOEvaluationResult,
} from '../../src/proxy-mcp/ops';

describe('Alert Posting', () => {
  const createOkResult = (): SLOEvaluationResult => ({
    timestamp: '2024-01-15T10:00:00.000Z',
    overallStatus: 'ok',
    checks: [
      {
        name: 'queue_size',
        status: 'ok',
        currentValue: 10,
        threshold: 50,
        message: 'Queue size OK (10)',
      },
    ],
    summary: 'All SLOs within thresholds',
  });

  const createWarnResult = (): SLOEvaluationResult => ({
    timestamp: '2024-01-15T10:00:00.000Z',
    overallStatus: 'warn',
    checks: [
      {
        name: 'queue_size',
        status: 'warn',
        currentValue: 75,
        threshold: 50,
        message: 'Queue size WARN: 75 jobs queued',
      },
    ],
    summary: 'WARN: Issues with queue_size',
  });

  const createCriticalResult = (): SLOEvaluationResult => ({
    timestamp: '2024-01-15T10:00:00.000Z',
    overallStatus: 'critical',
    checks: [
      {
        name: 'queue_size',
        status: 'critical',
        currentValue: 250,
        threshold: 200,
        message: 'Queue size CRITICAL: 250 jobs queued',
      },
    ],
    summary: 'CRITICAL: Issues with queue_size',
  });

  describe('shouldPostAlert', () => {
    it('should return false when alerts are disabled', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, enabled: false };
      const result = createWarnResult();

      expect(shouldPostAlert(result, config)).toBe(false);
    });

    it('should return false when status is OK', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, targetIssueNumber: 123 };
      const result = createOkResult();

      expect(shouldPostAlert(result, config)).toBe(false);
    });

    it('should return true for WARN with target issue', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, targetIssueNumber: 123 };
      const result = createWarnResult();

      expect(shouldPostAlert(result, config)).toBe(true);
    });

    it('should return true for CRITICAL with target issue', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, targetIssueNumber: 123 };
      const result = createCriticalResult();

      expect(shouldPostAlert(result, config)).toBe(true);
    });

    it('should return false for comment mode without target issue', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'comment', targetIssueNumber: null };
      const result = createWarnResult();

      expect(shouldPostAlert(result, config)).toBe(false);
    });

    it('should return true for newIssue mode without target issue', () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'newIssue', targetIssueNumber: null };
      const result = createWarnResult();

      expect(shouldPostAlert(result, config)).toBe(true);
    });
  });

  describe('postAlert', () => {
    it('should skip when alerts are disabled', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, enabled: false };
      const result = createWarnResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.action).toBe('skipped');
      expect(postResult.reason).toBe('Alerts disabled');
      expect(api.comments).toHaveLength(0);
      expect(api.issues).toHaveLength(0);
    });

    it('should skip when status is OK', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, targetIssueNumber: 123 };
      const result = createOkResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.action).toBe('skipped');
      expect(postResult.reason).toBe('Status is OK');
      expect(api.comments).toHaveLength(0);
    });

    it('should add comment for WARN with target issue', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'comment', targetIssueNumber: 123 };
      const result = createWarnResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.success).toBe(true);
      expect(postResult.action).toBe('posted');
      expect(postResult.issueNumber).toBe(123);
      expect(api.comments).toHaveLength(1);
      expect(api.comments[0].issueNumber).toBe(123);
      expect(api.comments[0].body).toContain('SLO Check');
    });

    it('should create new issue for newIssue mode', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'newIssue' };
      const result = createWarnResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.success).toBe(true);
      expect(postResult.action).toBe('posted');
      expect(api.issues).toHaveLength(1);
      expect(api.issues[0].title).toContain('SLO Alert');
      expect(api.issues[0].labels).toContain('slo-alert');
      expect(api.issues[0].labels).toContain('warn');
    });

    it('should create new issue on CRITICAL when createNewOnCritical is true', async () => {
      const config: AlertPostConfig = {
        ...DEFAULT_ALERT_CONFIG,
        mode: 'comment',
        targetIssueNumber: 123,
        createNewOnCritical: true,
      };
      const result = createCriticalResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.success).toBe(true);
      expect(postResult.action).toBe('posted');
      expect(api.issues).toHaveLength(1);
      expect(api.issues[0].labels).toContain('critical');
      expect(api.comments).toHaveLength(0);
    });

    it('should add comment on CRITICAL when createNewOnCritical is false', async () => {
      const config: AlertPostConfig = {
        ...DEFAULT_ALERT_CONFIG,
        mode: 'comment',
        targetIssueNumber: 123,
        createNewOnCritical: false,
      };
      const result = createCriticalResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.success).toBe(true);
      expect(postResult.action).toBe('posted');
      expect(api.comments).toHaveLength(1);
      expect(api.issues).toHaveLength(0);
    });

    it('should return error when no target issue for comment mode', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'comment', targetIssueNumber: null };
      const result = createWarnResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.success).toBe(false);
      expect(postResult.action).toBe('error');
      expect(postResult.reason).toContain('No target issue');
    });

    it('should include URL in result', async () => {
      const config: AlertPostConfig = { ...DEFAULT_ALERT_CONFIG, mode: 'newIssue' };
      const result = createWarnResult();
      const api = createMockGitHubAlertAPI();

      const postResult = await postAlert(result, config, api);

      expect(postResult.url).toBeDefined();
      expect(postResult.url).toContain('github.com');
    });
  });

  describe('Mock GitHub API', () => {
    it('should track all comments', async () => {
      const api = createMockGitHubAlertAPI();

      await api.addComment(1, 'First comment');
      await api.addComment(2, 'Second comment');
      await api.addComment(1, 'Third comment on first issue');

      expect(api.comments).toHaveLength(3);
      expect(api.comments[0].issueNumber).toBe(1);
      expect(api.comments[1].issueNumber).toBe(2);
    });

    it('should track all issues', async () => {
      const api = createMockGitHubAlertAPI();

      await api.createIssue('Title 1', 'Body 1', ['label1']);
      await api.createIssue('Title 2', 'Body 2');

      expect(api.issues).toHaveLength(2);
      expect(api.issues[0].labels).toEqual(['label1']);
      expect(api.issues[1].labels).toBeUndefined();
    });

    it('should return incrementing issue numbers', async () => {
      const api = createMockGitHubAlertAPI();

      const result1 = await api.createIssue('Title 1', 'Body 1');
      const result2 = await api.createIssue('Title 2', 'Body 2');

      expect(result1.number).toBe(1);
      expect(result2.number).toBe(2);
    });
  });
});
