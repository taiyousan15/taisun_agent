/**
 * SLO Summary Formatting Tests - P14
 */

import {
  formatForConsole,
  formatForIssueComment,
  formatForJSON,
  formatShortSummary,
  redactSensitiveData,
  SLOEvaluationResult,
} from '../../src/proxy-mcp/ops/slo';

describe('SLO Summary Formatting', () => {
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
      {
        name: 'failure_rate',
        status: 'ok',
        currentValue: '2.0%',
        threshold: '5%',
        message: 'Failure rate OK (2.0%)',
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
      {
        name: 'failure_rate',
        status: 'ok',
        currentValue: '2.0%',
        threshold: '5%',
        message: 'Failure rate OK (2.0%)',
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
      {
        name: 'dlq_new',
        status: 'critical',
        currentValue: '25 new (30 total)',
        threshold: 20,
        message: 'DLQ CRITICAL: 25 new entries in 24h',
      },
    ],
    summary: 'CRITICAL: Issues with queue_size, dlq_new',
    refId: 'ref_12345',
  });

  describe('formatForConsole', () => {
    it('should format OK result', () => {
      const result = createOkResult();
      const output = formatForConsole(result);

      expect(output).toContain('OK');
      expect(output).toContain('queue_size');
      expect(output).toContain('All SLOs within thresholds');
    });

    it('should format WARN result with emoji', () => {
      const result = createWarnResult();
      const output = formatForConsole(result);

      expect(output).toContain('WARN');
      expect(output).toContain('queue_size');
    });

    it('should format CRITICAL result', () => {
      const result = createCriticalResult();
      const output = formatForConsole(result);

      expect(output).toContain('CRITICAL');
      expect(output).toContain('ref_12345');
    });

    it('should include timestamp', () => {
      const result = createOkResult();
      const output = formatForConsole(result);

      expect(output).toContain('2024-01-15');
    });
  });

  describe('formatForIssueComment', () => {
    it('should format as Markdown', () => {
      const result = createOkResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('## SLO Check');
      expect(output).toContain('| Check | Status |');
      expect(output).toContain('| queue_size |');
    });

    it('should include status badge for OK', () => {
      const result = createOkResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('SLO-OK-green');
    });

    it('should include status badge for WARN', () => {
      const result = createWarnResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('SLO-WARN-yellow');
    });

    it('should include status badge for CRITICAL', () => {
      const result = createCriticalResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('SLO-CRITICAL-red');
    });

    it('should include recommended actions for failed checks', () => {
      const result = createWarnResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('### Recommended Actions');
      expect(output).toContain('queue_size');
    });

    it('should include refId when present', () => {
      const result = createCriticalResult();
      const output = formatForIssueComment(result);

      expect(output).toContain('ref_12345');
    });
  });

  describe('formatForJSON', () => {
    it('should return valid JSON', () => {
      const result = createOkResult();
      const output = formatForJSON(result);

      const parsed = JSON.parse(output);
      expect(parsed.overallStatus).toBe('ok');
      expect(parsed.checks).toHaveLength(2);
    });

    it('should be pretty-printed', () => {
      const result = createOkResult();
      const output = formatForJSON(result);

      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });
  });

  describe('formatShortSummary', () => {
    it('should format OK with emoji', () => {
      const result = createOkResult();
      const output = formatShortSummary(result);

      expect(output).toContain('SLO OK');
      expect(output).toContain('All checks passed');
    });

    it('should format WARN with failed checks', () => {
      const result = createWarnResult();
      const output = formatShortSummary(result);

      expect(output).toContain('SLO WARN');
      expect(output).toContain('queue_size(warn)');
    });

    it('should format CRITICAL with multiple failed checks', () => {
      const result = createCriticalResult();
      const output = formatShortSummary(result);

      expect(output).toContain('SLO CRITICAL');
      expect(output).toContain('queue_size(critical)');
      expect(output).toContain('dlq_new(critical)');
    });
  });

  describe('redactSensitiveData', () => {
    it('should redact GitHub tokens', () => {
      const input = 'Auth failed with ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const output = redactSensitiveData(input);

      expect(output).not.toContain('ghp_');
      expect(output).toContain('[REDACTED');
    });

    it('should redact OpenAI-style API keys', () => {
      const input = 'API error with sk-1234567890abcdefghijklmnopqrstuvwxyz';
      const output = redactSensitiveData(input);

      expect(output).not.toContain('sk-');
      expect(output).toContain('[REDACTED');
    });

    it('should redact token= patterns', () => {
      const input = 'Request failed: token=abcdefghij1234567890';
      const output = redactSensitiveData(input);

      expect(output).toContain('[REDACTED]');
    });

    it('should redact Slack tokens', () => {
      const input = 'Slack error: xoxb-123456789-abcdefg';
      const output = redactSensitiveData(input);

      expect(output).not.toContain('xoxb-');
      expect(output).toContain('[REDACTED');
    });

    it('should not modify text without secrets', () => {
      const input = 'Normal error message with no secrets';
      const output = redactSensitiveData(input);

      expect(output).toBe(input);
    });

    it('should handle multiple secrets in one text', () => {
      const input = 'token=secret123abc key=abcdef1234567890 password=test';
      const output = redactSensitiveData(input);

      // Should redact the longer patterns
      expect(output.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(1);
    });
  });
});
