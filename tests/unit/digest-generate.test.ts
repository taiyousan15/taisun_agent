/**
 * Weekly Digest Generation Tests - P17
 */

import {
  generateWeeklyDigest,
  digestToMarkdown,
  isDigestDay,
} from '../../src/proxy-mcp/ops/digest/generate';
import { InMemoryIncidentStateStore } from '../../src/proxy-mcp/ops/incidents/state-store';
import type { IncidentState } from '../../src/proxy-mcp/ops/incidents/types';

describe('Weekly Digest Generation', () => {
  let store: InMemoryIncidentStateStore;

  beforeEach(() => {
    store = new InMemoryIncidentStateStore();
  });

  const createIncident = (
    key: string,
    overrides: Partial<IncidentState> = {}
  ): IncidentState => {
    const now = new Date();
    return {
      incidentKey: key,
      firstSeen: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      lastSeen: now.toISOString(),
      currentStatus: 'resolved',
      severity: 'warn',
      lastPostedAt: null,
      lastNotifiedAt: null,
      incidentIssueCreatedAt: null,
      incidentIssueNumber: null,
      occurrenceCount: 1,
      topReasons: ['timeout'],
      affectedComponents: ['api'],
      summary: 'Test incident',
      ...overrides,
    };
  };

  describe('generateWeeklyDigest', () => {
    it('should generate empty digest when no incidents', async () => {
      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.summary.totalIncidents).toBe(0);
      expect(digest.topCauses).toHaveLength(0);
      expect(digest.recommendedActions).toHaveLength(0);
    });

    it('should count incidents by severity', async () => {
      await store.set(createIncident('key1', { severity: 'critical' }));
      await store.set(createIncident('key2', { severity: 'critical' }));
      await store.set(createIncident('key3', { severity: 'warn' }));
      await store.set(createIncident('key4', { severity: 'info' }));

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.summary.totalIncidents).toBe(4);
      expect(digest.summary.criticalCount).toBe(2);
      expect(digest.summary.warnCount).toBe(1);
      expect(digest.summary.infoCount).toBe(1);
    });

    it('should count incidents by status', async () => {
      await store.set(
        createIncident('key1', { currentStatus: 'resolved' })
      );
      await store.set(
        createIncident('key2', { currentStatus: 'active' })
      );
      await store.set(
        createIncident('key3', { currentStatus: 'active' })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.summary.resolvedCount).toBe(1);
      expect(digest.summary.activeCount).toBe(2);
    });

    it('should identify top causes', async () => {
      await store.set(createIncident('key1', { topReasons: ['timeout'] }));
      await store.set(createIncident('key2', { topReasons: ['timeout'] }));
      await store.set(createIncident('key3', { topReasons: ['timeout'] }));
      await store.set(
        createIncident('key4', { topReasons: ['connection refused'] })
      );

      const digest = await generateWeeklyDigest(store, {
        lookbackDays: 7,
        topCauses: 3,
      });

      expect(digest.topCauses.length).toBeGreaterThan(0);
      expect(digest.topCauses[0].reason).toBe('timeout');
      expect(digest.topCauses[0].count).toBe(3);
    });

    it('should generate recommended actions for known patterns', async () => {
      await store.set(createIncident('key1', { topReasons: ['timeout'] }));
      await store.set(
        createIncident('key2', { topReasons: ['rate limit exceeded'] })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.recommendedActions.length).toBeGreaterThan(0);
      expect(
        digest.recommendedActions.some((a) =>
          a.action.toLowerCase().includes('retry')
        )
      ).toBe(true);
    });

    it('should calculate component health', async () => {
      await store.set(
        createIncident('key1', {
          affectedComponents: ['api-gateway'],
          severity: 'critical',
        })
      );
      await store.set(
        createIncident('key2', {
          affectedComponents: ['api-gateway'],
          severity: 'warn',
        })
      );
      await store.set(
        createIncident('key3', {
          affectedComponents: ['database'],
          severity: 'info',
        })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.componentHealth.length).toBe(2);

      const apiGateway = digest.componentHealth.find(
        (c) => c.component === 'api-gateway'
      );
      const database = digest.componentHealth.find(
        (c) => c.component === 'database'
      );

      // api-gateway has more incidents and a critical, should have lower health
      expect(apiGateway!.healthScore).toBeLessThan(database!.healthScore);
    });

    it('should respect lookback days', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const old = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      await store.set(
        createIncident('key1', { lastSeen: recent.toISOString() })
      );
      await store.set(
        createIncident('key2', { lastSeen: old.toISOString() })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });

      expect(digest.summary.totalIncidents).toBe(1);
    });
  });

  describe('digestToMarkdown', () => {
    it('should generate valid markdown', async () => {
      await store.set(
        createIncident('key1', {
          severity: 'critical',
          topReasons: ['timeout'],
        })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });
      const markdown = digestToMarkdown(digest);

      expect(markdown).toContain('# Weekly Incident Digest');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('Total Incidents');
      expect(markdown).toContain('## Top Causes');
      expect(markdown).toContain('timeout');
    });

    it('should include recommended actions', async () => {
      await store.set(createIncident('key1', { topReasons: ['timeout'] }));

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });
      const markdown = digestToMarkdown(digest);

      expect(markdown).toContain('## Recommended Actions');
      expect(markdown).toContain('retry');
    });

    it('should include component health table', async () => {
      await store.set(
        createIncident('key1', { affectedComponents: ['api-gateway'] })
      );

      const digest = await generateWeeklyDigest(store, { lookbackDays: 7 });
      const markdown = digestToMarkdown(digest);

      expect(markdown).toContain('## Component Health');
      expect(markdown).toContain('api-gateway');
      expect(markdown).toContain('/100');
    });
  });

  describe('isDigestDay', () => {
    it('should return true on configured day', () => {
      const today = new Date().getDay();
      const result = isDigestDay({
        enabled: true,
        createIssue: false,
        dayOfWeek: today,
        topCauses: 3,
        lookbackDays: 7,
      });

      expect(result).toBe(true);
    });

    it('should return false on other days', () => {
      const today = new Date().getDay();
      const otherDay = (today + 3) % 7; // A different day
      const result = isDigestDay({
        enabled: true,
        createIssue: false,
        dayOfWeek: otherDay,
        topCauses: 3,
        lookbackDays: 7,
      });

      expect(result).toBe(false);
    });
  });
});
