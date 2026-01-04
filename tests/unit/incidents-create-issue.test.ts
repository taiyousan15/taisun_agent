/**
 * Incident Issue Creation Tests - P17
 */

import {
  shouldCreateIncidentIssue,
  createIncidentIssue,
  processIncidentIssueCreation,
  MockGitHubIssueAPI,
} from '../../src/proxy-mcp/ops/incidents/create-issue';
import { InMemoryIncidentStateStore } from '../../src/proxy-mcp/ops/incidents/state-store';
import {
  DEFAULT_INCIDENT_CONFIG,
  type IncidentConfig,
  type IncidentState,
} from '../../src/proxy-mcp/ops/incidents/types';

describe('Incident Issue Creation', () => {
  let store: InMemoryIncidentStateStore;
  let api: MockGitHubIssueAPI;
  let config: IncidentConfig;

  beforeEach(() => {
    store = new InMemoryIncidentStateStore();
    api = new MockGitHubIssueAPI();
    config = {
      ...DEFAULT_INCIDENT_CONFIG,
      createIssueOnCritical: true, // Enable for testing
      criticalPersistMinutes: 60,
    };
  });

  const createState = (
    overrides: Partial<IncidentState> = {}
  ): IncidentState => {
    const now = new Date();
    return {
      incidentKey: 'test-key-1234',
      firstSeen: new Date(now.getTime() - 90 * 60 * 1000).toISOString(), // 90 min ago
      lastSeen: now.toISOString(),
      currentStatus: 'active',
      severity: 'critical',
      lastPostedAt: null,
      lastNotifiedAt: null,
      incidentIssueCreatedAt: null,
      incidentIssueNumber: null,
      occurrenceCount: 5,
      topReasons: ['timeout', 'connection refused'],
      affectedComponents: ['api-gateway'],
      summary: '[CRITICAL] timeout | api-gateway',
      ...overrides,
    };
  };

  describe('shouldCreateIncidentIssue', () => {
    it('should return true when all conditions are met', () => {
      const state = createState();
      const result = shouldCreateIncidentIssue(state, config);

      expect(result.should).toBe(true);
      expect(result.reason).toBe('qualifies');
    });

    it('should return false when feature is disabled', () => {
      const disabledConfig = { ...config, createIssueOnCritical: false };
      const state = createState();
      const result = shouldCreateIncidentIssue(state, disabledConfig);

      expect(result.should).toBe(false);
      expect(result.reason).toBe('feature_disabled');
    });

    it('should return false when severity is not critical', () => {
      const state = createState({ severity: 'warn' });
      const result = shouldCreateIncidentIssue(state, config);

      expect(result.should).toBe(false);
      expect(result.reason).toBe('not_critical');
    });

    it('should return false when incident is resolved', () => {
      const state = createState({ currentStatus: 'resolved' });
      const result = shouldCreateIncidentIssue(state, config);

      expect(result.should).toBe(false);
      expect(result.reason).toBe('not_active');
    });

    it('should return false when issue already created', () => {
      const state = createState({
        incidentIssueCreatedAt: new Date().toISOString(),
        incidentIssueNumber: 123,
      });
      const result = shouldCreateIncidentIssue(state, config);

      expect(result.should).toBe(false);
      expect(result.reason).toBe('issue_already_created');
    });

    it('should return false when persist time not met', () => {
      const state = createState({
        firstSeen: new Date().toISOString(), // Just now
      });
      const result = shouldCreateIncidentIssue(state, config);

      expect(result.should).toBe(false);
      expect(result.reason).toContain('persist_time_not_met');
    });
  });

  describe('createIncidentIssue', () => {
    it('should create issue when conditions are met', async () => {
      const state = createState();
      await store.set(state);

      const result = await createIncidentIssue(state, store, config, api);

      expect(result.created).toBe(true);
      expect(result.issueNumber).toBeDefined();
      expect(result.issueUrl).toContain('github.com');
      expect(api.createdIssues).toHaveLength(1);
    });

    it('should include incident details in issue body', async () => {
      const state = createState();
      await store.set(state);

      await createIncidentIssue(state, store, config, api);

      const issue = api.createdIssues[0];
      expect(issue.title).toContain('[INCIDENT]');
      expect(issue.title).toContain('CRITICAL');
      expect(issue.body).toContain('timeout');
      expect(issue.body).toContain('api-gateway');
      expect(issue.labels).toContain('incident');
      expect(issue.labels).toContain('critical');
    });

    it('should update state after issue creation', async () => {
      const state = createState();
      await store.set(state);

      const result = await createIncidentIssue(state, store, config, api);

      const updatedState = await store.get(state.incidentKey);
      expect(updatedState?.incidentIssueCreatedAt).not.toBeNull();
      expect(updatedState?.incidentIssueNumber).toBe(result.issueNumber);
    });

    it('should not create issue when conditions not met', async () => {
      const state = createState({ severity: 'warn' });
      await store.set(state);

      const result = await createIncidentIssue(state, store, config, api);

      expect(result.created).toBe(false);
      expect(result.reason).toBe('not_critical');
      expect(api.createdIssues).toHaveLength(0);
    });
  });

  describe('processIncidentIssueCreation', () => {
    it('should process all qualifying incidents', async () => {
      // Add multiple critical incidents
      const state1 = createState({ incidentKey: 'key-1' });
      const state2 = createState({ incidentKey: 'key-2' });
      const state3 = createState({
        incidentKey: 'key-3',
        severity: 'warn', // Not critical
      });

      await store.set(state1);
      await store.set(state2);
      await store.set(state3);

      const results = await processIncidentIssueCreation(store, config, api);

      expect(results).toHaveLength(2);
      expect(api.createdIssues).toHaveLength(2);
    });

    it('should skip incidents with existing issues', async () => {
      const state = createState({
        incidentIssueCreatedAt: new Date().toISOString(),
        incidentIssueNumber: 999,
      });
      await store.set(state);

      const results = await processIncidentIssueCreation(store, config, api);

      expect(results).toHaveLength(0);
    });

    it('should return empty when feature disabled', async () => {
      const disabledConfig = { ...config, createIssueOnCritical: false };
      const state = createState();
      await store.set(state);

      const results = await processIncidentIssueCreation(
        store,
        disabledConfig,
        api
      );

      expect(results).toHaveLength(0);
    });
  });
});
