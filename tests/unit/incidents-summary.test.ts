/**
 * Incident Summary Tests - P17
 */
import {
  generateIncidentSummary,
  incidentToMarkdown,
  incidentToOneLiner,
  generateActiveIncidentsSummary,
  redactSummary,
} from '../../src/proxy-mcp/ops/incidents/summary';
import { InMemoryIncidentStateStore } from '../../src/proxy-mcp/ops/incidents/state-store';
import { DEFAULT_INCIDENT_CONFIG } from '../../src/proxy-mcp/ops/incidents/types';
import type { IncidentState } from '../../src/proxy-mcp/ops/incidents/types';

describe('generateIncidentSummary', () => {
  const createState = (): IncidentState => ({
    incidentKey: 'abc123def456',
    firstSeen: '2024-01-01T00:00:00Z',
    lastSeen: '2024-01-01T01:00:00Z',
    currentStatus: 'active',
    severity: 'critical',
    lastPostedAt: null,
    lastNotifiedAt: null,
    incidentIssueCreatedAt: null,
    incidentIssueNumber: null,
    occurrenceCount: 5,
    topReasons: ['timeout', 'connection refused'],
    affectedComponents: ['api-gateway', 'database'],
    summary: '[CRITICAL] timeout | api-gateway',
  });

  it('should generate summary from state', () => {
    const state = createState();
    const summary = generateIncidentSummary(state);

    expect(summary.incidentKey).toBe('abc123def456');
    expect(summary.severity).toBe('critical');
    expect(summary.status).toBe('active');
    expect(summary.occurrenceCount).toBe(5);
    expect(summary.topReasons).toEqual(['timeout', 'connection refused']);
  });

  it('should include refId when provided', () => {
    const state = createState();
    const summary = generateIncidentSummary(state, 'ref-123');

    expect(summary.refId).toBe('ref-123');
  });
});

describe('incidentToMarkdown', () => {
  it('should generate markdown with all fields', () => {
    const summary = {
      incidentKey: 'abc123def456',
      severity: 'critical' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 5,
      topReasons: ['timeout', 'connection refused'],
      affectedComponents: ['api-gateway', 'database'],
      summary: '[CRITICAL] timeout',
    };

    const md = incidentToMarkdown(summary);

    expect(md).toContain('## 🔴 Incident:');
    expect(md).toContain('**Severity**: 🚨 CRITICAL');
    expect(md).toContain('**Status**: active');
    expect(md).toContain('**Occurrences**: 5');
    expect(md).toContain('### Top Reasons');
    expect(md).toContain('- timeout');
    expect(md).toContain('### Affected Components');
    expect(md).toContain('api-gateway');
  });

  it('should show resolved status correctly', () => {
    const summary = {
      incidentKey: 'abc123',
      severity: 'ok' as const,
      status: 'resolved' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 1,
      topReasons: [],
      affectedComponents: [],
      summary: 'Resolved',
    };

    const md = incidentToMarkdown(summary);

    expect(md).toContain('## ✅ Incident:');
    expect(md).toContain('**Severity**: ✅ OK');
    expect(md).toContain('**Status**: resolved');
  });

  it('should include refId when provided', () => {
    const summary = {
      incidentKey: 'abc123',
      severity: 'warn' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 1,
      topReasons: [],
      affectedComponents: [],
      summary: 'Warning',
      refId: 'ref-456',
    };

    const md = incidentToMarkdown(summary);

    expect(md).toContain('📎 **Reference**: `ref-456`');
  });
});

describe('incidentToOneLiner', () => {
  it('should generate compact one-liner', () => {
    const summary = {
      incidentKey: 'abc123def456',
      severity: 'critical' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 5,
      topReasons: ['timeout'],
      affectedComponents: ['api'],
      summary: 'Test',
    };

    const oneLiner = incidentToOneLiner(summary);

    expect(oneLiner).toContain('🔴');
    expect(oneLiner).toContain('[CRITICAL]');
    expect(oneLiner).toContain('abc123de');
    expect(oneLiner).toContain('x5');
    expect(oneLiner).toContain('timeout');
  });

  it('should handle empty reasons', () => {
    const summary = {
      incidentKey: 'abc123',
      severity: 'info' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 1,
      topReasons: [],
      affectedComponents: [],
      summary: 'Test',
    };

    const oneLiner = incidentToOneLiner(summary);

    expect(oneLiner).toContain('[INFO]');
    expect(oneLiner).not.toContain('undefined');
  });
});

describe('generateActiveIncidentsSummary', () => {
  let store: InMemoryIncidentStateStore;

  beforeEach(() => {
    store = new InMemoryIncidentStateStore();
  });

  it('should return message when no active incidents', async () => {
    const summary = await generateActiveIncidentsSummary(
      store,
      DEFAULT_INCIDENT_CONFIG
    );

    expect(summary).toContain('No active incidents');
    expect(summary).toContain('✅');
  });

  it('should list active incidents', async () => {
    await store.set({
      incidentKey: 'key1',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      currentStatus: 'active',
      severity: 'critical',
      lastPostedAt: null,
      lastNotifiedAt: null,
      incidentIssueCreatedAt: null,
      incidentIssueNumber: null,
      occurrenceCount: 3,
      topReasons: ['error'],
      affectedComponents: ['api'],
      summary: 'Test',
    });

    const summary = await generateActiveIncidentsSummary(
      store,
      DEFAULT_INCIDENT_CONFIG
    );

    expect(summary).toContain('Active Incidents (1)');
    expect(summary).toContain('🔴');
  });

  it('should sort by severity', async () => {
    await store.set({
      incidentKey: 'key1',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      currentStatus: 'active',
      severity: 'warn',
      lastPostedAt: null,
      lastNotifiedAt: null,
      incidentIssueCreatedAt: null,
      incidentIssueNumber: null,
      occurrenceCount: 1,
      topReasons: ['warn reason'],
      affectedComponents: [],
      summary: 'Warn',
    });

    await store.set({
      incidentKey: 'key2',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      currentStatus: 'active',
      severity: 'critical',
      lastPostedAt: null,
      lastNotifiedAt: null,
      incidentIssueCreatedAt: null,
      incidentIssueNumber: null,
      occurrenceCount: 1,
      topReasons: ['critical reason'],
      affectedComponents: [],
      summary: 'Critical',
    });

    const summary = await generateActiveIncidentsSummary(
      store,
      DEFAULT_INCIDENT_CONFIG
    );

    // Critical should appear first
    const criticalPos = summary.indexOf('CRITICAL');
    const warnPos = summary.indexOf('WARN');
    expect(criticalPos).toBeLessThan(warnPos);
  });
});

describe('redactSummary', () => {
  it('should redact sensitive data in summary', () => {
    const summary = {
      incidentKey: 'abc123',
      severity: 'critical' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 1,
      topReasons: ['API key sk-abc123def456ghi789jkl012mno345pqr678 expired'],
      affectedComponents: ['api'],
      summary: 'Token ghp_abcdefghijklmnopqrstuvwxyz123456 invalid',
    };

    const redacted = redactSummary(summary);

    expect(redacted.topReasons[0]).toContain('[REDACTED]');
    expect(redacted.topReasons[0]).not.toContain('sk-abc123');
    expect(redacted.summary).toContain('[REDACTED]');
    expect(redacted.summary).not.toContain('ghp_');
  });

  it('should preserve non-sensitive data', () => {
    const summary = {
      incidentKey: 'abc123',
      severity: 'warn' as const,
      status: 'active' as const,
      firstSeen: '2024-01-01T00:00:00Z',
      lastSeen: '2024-01-01T01:00:00Z',
      occurrenceCount: 1,
      topReasons: ['timeout after 30s'],
      affectedComponents: ['api-gateway'],
      summary: 'Service timeout',
    };

    const redacted = redactSummary(summary);

    expect(redacted.topReasons[0]).toBe('timeout after 30s');
    expect(redacted.summary).toBe('Service timeout');
    expect(redacted.affectedComponents).toEqual(['api-gateway']);
  });
});
