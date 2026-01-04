/**
 * Incident State Store Tests - P17
 */
import {
  InMemoryIncidentStateStore,
  createStateStore,
} from '../../src/proxy-mcp/ops/incidents/state-store';
import type { IncidentState } from '../../src/proxy-mcp/ops/incidents/types';

describe('InMemoryIncidentStateStore', () => {
  let store: InMemoryIncidentStateStore;

  beforeEach(() => {
    store = new InMemoryIncidentStateStore();
  });

  const createState = (
    key: string,
    overrides: Partial<IncidentState> = {}
  ): IncidentState => ({
    incidentKey: key,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    currentStatus: 'active',
    severity: 'critical',
    lastPostedAt: null,
    lastNotifiedAt: null,
    incidentIssueCreatedAt: null,
    incidentIssueNumber: null,
    occurrenceCount: 1,
    topReasons: ['error'],
    affectedComponents: ['service'],
    summary: 'Test incident',
    ...overrides,
  });

  describe('get/set', () => {
    it('should store and retrieve state', async () => {
      const state = createState('key1');
      await store.set(state);

      const retrieved = await store.get('key1');
      expect(retrieved).toEqual(state);
    });

    it('should return null for non-existent key', async () => {
      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should update existing state', async () => {
      const state1 = createState('key1', { occurrenceCount: 1 });
      await store.set(state1);

      const state2 = createState('key1', { occurrenceCount: 5 });
      await store.set(state2);

      const retrieved = await store.get('key1');
      expect(retrieved?.occurrenceCount).toBe(5);
    });
  });

  describe('getAll', () => {
    it('should return all states', async () => {
      await store.set(createState('key1'));
      await store.set(createState('key2'));
      await store.set(createState('key3'));

      const all = await store.getAll();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when empty', async () => {
      const all = await store.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('getByStatus', () => {
    it('should filter by status', async () => {
      await store.set(createState('key1', { currentStatus: 'active' }));
      await store.set(createState('key2', { currentStatus: 'resolved' }));
      await store.set(createState('key3', { currentStatus: 'active' }));

      const active = await store.getByStatus('active');
      expect(active).toHaveLength(2);

      const resolved = await store.getByStatus('resolved');
      expect(resolved).toHaveLength(1);
    });
  });

  describe('getBySeverity', () => {
    it('should filter by severity', async () => {
      await store.set(createState('key1', { severity: 'critical' }));
      await store.set(createState('key2', { severity: 'warn' }));
      await store.set(createState('key3', { severity: 'critical' }));

      const critical = await store.getBySeverity('critical');
      expect(critical).toHaveLength(2);

      const warn = await store.getBySeverity('warn');
      expect(warn).toHaveLength(1);
    });
  });

  describe('getRecent', () => {
    it('should return incidents from recent days', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      await store.set(
        createState('key1', { lastSeen: now.toISOString() })
      );
      await store.set(
        createState('key2', { lastSeen: yesterday.toISOString() })
      );
      await store.set(
        createState('key3', { lastSeen: lastWeek.toISOString() })
      );

      const recent = await store.getRecent(3);
      expect(recent).toHaveLength(2);
    });
  });

  describe('cleanup', () => {
    it('should remove old resolved incidents', async () => {
      const now = new Date();
      const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      await store.set(
        createState('key1', {
          currentStatus: 'resolved',
          lastSeen: old.toISOString(),
        })
      );
      await store.set(
        createState('key2', {
          currentStatus: 'active',
          lastSeen: old.toISOString(),
        })
      );
      await store.set(
        createState('key3', {
          currentStatus: 'resolved',
          lastSeen: now.toISOString(),
        })
      );

      const removed = await store.cleanup(30);
      expect(removed).toBe(1);

      const all = await store.getAll();
      expect(all).toHaveLength(2);
    });

    it('should not remove active incidents', async () => {
      const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      await store.set(
        createState('key1', {
          currentStatus: 'active',
          lastSeen: old.toISOString(),
        })
      );

      const removed = await store.cleanup(30);
      expect(removed).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await store.set(createState('key1'));
      await store.set(createState('key2'));

      store.clear();

      const all = await store.getAll();
      expect(all).toEqual([]);
    });
  });
});

describe('createStateStore', () => {
  it('should create memory store', () => {
    const store = createStateStore({
      type: 'memory',
      path: '',
      maxEntries: 1000,
      retentionDays: 30,
    });

    expect(store).toBeInstanceOf(InMemoryIncidentStateStore);
  });

  it('should create jsonl store by default', () => {
    const store = createStateStore({
      type: 'jsonl',
      path: '/tmp/test-incidents.jsonl',
      maxEntries: 1000,
      retentionDays: 30,
    });

    expect(store).not.toBeInstanceOf(InMemoryIncidentStateStore);
  });
});
