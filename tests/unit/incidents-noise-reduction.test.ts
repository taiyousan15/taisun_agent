/**
 * Incident Noise Reduction Tests - P17
 *
 * Tests for incident deduplication and cooldown logic
 */

import {
  updateIncidentState,
} from '../../src/proxy-mcp/ops/incidents/update';
import {
  InMemoryIncidentStateStore,
} from '../../src/proxy-mcp/ops/incidents/state-store';
import {
  DEFAULT_INCIDENT_CONFIG,
  type IncidentConfig,
  type CorrelationInput,
} from '../../src/proxy-mcp/ops/incidents/types';

describe('Noise Reduction', () => {
  let store: InMemoryIncidentStateStore;
  let config: IncidentConfig;

  beforeEach(() => {
    store = new InMemoryIncidentStateStore();
    config = {
      ...DEFAULT_INCIDENT_CONFIG,
      incidentCooldownMinutes: 120, // 2 hours
    };
  });

  const createInput = (
    severity: 'critical' | 'warn' | 'info' | 'ok' = 'critical',
    overrides: Partial<CorrelationInput> = {}
  ): CorrelationInput => ({
    severity,
    reasons: ['timeout', 'connection refused'],
    components: ['api-gateway'],
    ...overrides,
  });

  describe('First occurrence', () => {
    it('should allow post and notify on first occurrence', async () => {
      const input = createInput('critical');
      const { decision } = await updateIncidentState(store, input, config);

      expect(decision.shouldPost).toBe(true);
      expect(decision.shouldNotify).toBe(true);
      expect(decision.suppressedReason).toBeNull();
    });

    it('should not create incident issue on first occurrence', async () => {
      const input = createInput('critical');
      const { decision } = await updateIncidentState(store, input, config);

      expect(decision.shouldCreateIncidentIssue).toBe(false);
    });
  });

  describe('Cooldown suppression', () => {
    it('should suppress duplicate within cooldown period', async () => {
      const input = createInput('critical');

      // First occurrence
      await updateIncidentState(store, input, config);

      // Second occurrence (immediate) - should be suppressed
      const { decision: second } = await updateIncidentState(
        store,
        input,
        config
      );

      expect(second.shouldPost).toBe(false);
      expect(second.shouldNotify).toBe(false);
      expect(second.suppressedReason).toBe('cooldown_active');
    });

    it('should allow after cooldown expires', async () => {
      const input = createInput('critical');

      // First occurrence
      const { state: first } = await updateIncidentState(store, input, config);

      // Manually expire cooldown by updating timestamps
      const expired = new Date();
      expired.setMinutes(expired.getMinutes() - 150); // 2.5 hours ago
      await store.set({
        ...first,
        lastPostedAt: expired.toISOString(),
        lastNotifiedAt: expired.toISOString(),
      });

      // Should now be allowed
      const { decision } = await updateIncidentState(store, input, config);

      expect(decision.shouldPost).toBe(true);
      expect(decision.shouldNotify).toBe(true);
    });
  });

  describe('Status change handling', () => {
    it('should allow recovery notification when same key resolves', async () => {
      // Note: When severity changes, the correlation key changes too.
      // To test recovery, we need to configure correlation to exclude severity.
      const configWithoutSeverity: IncidentConfig = {
        ...config,
        correlationConfig: {
          ...config.correlationConfig,
          includeSeverity: false, // Key based on reasons+components only
        },
      };

      const input = createInput('critical');
      await updateIncidentState(store, input, configWithoutSeverity);

      // Resolve (same reasons/components, different severity)
      const resolved = createInput('ok');
      const { decision } = await updateIncidentState(
        store,
        resolved,
        configWithoutSeverity
      );

      expect(decision.shouldPost).toBe(true);
      expect(decision.shouldNotify).toBe(true);
    });

    it('should not post if already resolved', async () => {
      // Start as ok
      const input = createInput('ok');
      await updateIncidentState(store, input, config);

      // Another ok (already resolved)
      const { decision } = await updateIncidentState(store, input, config);

      expect(decision.shouldPost).toBe(false);
      expect(decision.suppressedReason).toBe('already_resolved');
    });
  });

  describe('Severity escalation', () => {
    it('should allow on severity escalation', async () => {
      // Configure to track by reasons/components, not severity
      const configWithoutSeverity: IncidentConfig = {
        ...config,
        correlationConfig: {
          ...config.correlationConfig,
          includeSeverity: false,
        },
      };

      // Start as warn
      const warn = createInput('warn');
      await updateIncidentState(store, warn, configWithoutSeverity);

      // Escalate to critical
      const critical = createInput('critical');
      const { decision } = await updateIncidentState(
        store,
        critical,
        configWithoutSeverity
      );

      expect(decision.shouldPost).toBe(true);
      expect(decision.shouldNotify).toBe(true);
    });
  });

  describe('Different incidents', () => {
    it('should allow different incidents independently', async () => {
      // First incident
      const incident1 = createInput('critical', { reasons: ['timeout'] });
      await updateIncidentState(store, incident1, config);

      // Different incident (different reasons = different key)
      const incident2 = createInput('critical', { reasons: ['memory error'] });
      const { decision } = await updateIncidentState(store, incident2, config);

      // Should be allowed because it's a different incident
      expect(decision.shouldPost).toBe(true);
      expect(decision.shouldNotify).toBe(true);
    });
  });

  describe('Disabled feature', () => {
    it('should suppress all when disabled', async () => {
      const disabledConfig: IncidentConfig = {
        ...config,
        enabled: false,
      };

      const input = createInput('critical');
      const { decision } = await updateIncidentState(
        store,
        input,
        disabledConfig
      );

      expect(decision.shouldPost).toBe(false);
      expect(decision.shouldNotify).toBe(false);
      expect(decision.suppressedReason).toBe('incident_lifecycle_disabled');
    });
  });

  describe('State persistence', () => {
    it('should track occurrence count', async () => {
      const input = createInput('critical');

      await updateIncidentState(store, input, config);
      await updateIncidentState(store, input, config);
      const { state } = await updateIncidentState(store, input, config);

      expect(state.occurrenceCount).toBe(3);
    });

    it('should update lastSeen timestamp', async () => {
      const input = createInput('critical');

      const { state: first } = await updateIncidentState(store, input, config);
      const firstLastSeen = first.lastSeen;

      // Wait a tiny bit
      await new Promise((r) => setTimeout(r, 10));

      const { state: second } = await updateIncidentState(store, input, config);

      expect(second.lastSeen).not.toBe(firstLastSeen);
    });
  });

  describe('Redaction in state', () => {
    it('should redact sensitive data in summary', async () => {
      const input = createInput('critical', {
        reasons: ['API key sk-abc123def456ghi789jkl012mno345pqr678 expired'],
      });

      const { state } = await updateIncidentState(store, input, config);

      expect(state.topReasons[0]).toContain('[REDACTED]');
      expect(state.topReasons[0]).not.toContain('sk-abc123');
    });
  });
});
