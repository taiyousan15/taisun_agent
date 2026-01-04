/**
 * Incident Update Logic - P17
 *
 * Handles incident state transitions and action decisions
 */

import { redact } from './redact';
import type {
  ActionDecision,
  CorrelationInput,
  IIncidentStateStore,
  IncidentConfig,
  IncidentState,
  IncidentStatus,
} from './types';
import { generateCorrelationKey, correlationSummary } from './correlate';

/**
 * Update incident state and determine what actions to take
 */
export async function updateIncidentState(
  store: IIncidentStateStore,
  input: CorrelationInput,
  config: IncidentConfig
): Promise<{ state: IncidentState; decision: ActionDecision }> {
  const now = new Date().toISOString();
  const incidentKey = generateCorrelationKey(input, config.correlationConfig);

  // Get existing state
  const existing = await store.get(incidentKey);

  // Determine new status
  const newStatus: IncidentStatus = input.severity === 'ok' ? 'resolved' : 'active';

  // Build new state
  const state: IncidentState = existing
    ? {
        ...existing,
        lastSeen: now,
        currentStatus: newStatus,
        severity: input.severity,
        occurrenceCount: existing.occurrenceCount + 1,
        topReasons: redactReasons(input.reasons.slice(0, 5), config),
        affectedComponents: input.components.slice(0, 10),
        summary: redact(correlationSummary(input), {
          patterns: config.redaction.patterns,
        }),
      }
    : {
        incidentKey,
        firstSeen: now,
        lastSeen: now,
        currentStatus: newStatus,
        severity: input.severity,
        lastPostedAt: null,
        lastNotifiedAt: null,
        incidentIssueCreatedAt: null,
        incidentIssueNumber: null,
        occurrenceCount: 1,
        topReasons: redactReasons(input.reasons.slice(0, 5), config),
        affectedComponents: input.components.slice(0, 10),
        summary: redact(correlationSummary(input), {
          patterns: config.redaction.patterns,
        }),
      };

  // Determine actions
  const decision = determineActions(existing, state, config);

  // Update timestamps based on decision
  if (decision.shouldPost) {
    state.lastPostedAt = now;
  }
  if (decision.shouldNotify) {
    state.lastNotifiedAt = now;
  }
  if (decision.shouldCreateIncidentIssue && !state.incidentIssueCreatedAt) {
    state.incidentIssueCreatedAt = now;
  }

  // Persist state
  await store.set(state);

  return { state, decision };
}

/**
 * Determine what actions should be taken
 */
function determineActions(
  existing: IncidentState | null,
  current: IncidentState,
  config: IncidentConfig
): ActionDecision {
  const now = new Date();

  // If disabled, suppress all
  if (!config.enabled) {
    return {
      shouldPost: false,
      shouldNotify: false,
      shouldCreateIncidentIssue: false,
      suppressedReason: 'incident_lifecycle_disabled',
    };
  }

  // If resolved, always allow (recovery notification)
  if (current.currentStatus === 'resolved') {
    const wasActive = existing?.currentStatus === 'active';
    return {
      shouldPost: wasActive,
      shouldNotify: wasActive,
      shouldCreateIncidentIssue: false,
      suppressedReason: wasActive ? null : 'already_resolved',
    };
  }

  // New incident - allow all
  if (!existing) {
    return {
      shouldPost: true,
      shouldNotify: true,
      shouldCreateIncidentIssue: false,
      suppressedReason: null,
    };
  }

  // Check cooldown for posts
  const cooldownMs = config.incidentCooldownMinutes * 60 * 1000;
  const lastPostedAt = existing.lastPostedAt
    ? new Date(existing.lastPostedAt)
    : null;
  const postCooldownExpired =
    !lastPostedAt || now.getTime() - lastPostedAt.getTime() > cooldownMs;

  // Check cooldown for notifications
  const lastNotifiedAt = existing.lastNotifiedAt
    ? new Date(existing.lastNotifiedAt)
    : null;
  const notifyCooldownExpired =
    !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() > cooldownMs;

  // Check for status change
  const statusChanged = existing.currentStatus !== current.currentStatus;

  // Check for severity escalation
  const severityEscalated = isSeverityEscalation(
    existing.severity,
    current.severity
  );

  // Determine if we should post/notify
  const shouldPost = statusChanged || severityEscalated || postCooldownExpired;
  const shouldNotify = statusChanged || severityEscalated || notifyCooldownExpired;

  // Check for incident issue creation
  const shouldCreateIncidentIssue = shouldCreateIssue(existing, current, config);

  // Build suppressed reason
  let suppressedReason: string | null = null;
  if (!shouldPost && !shouldNotify) {
    suppressedReason = 'cooldown_active';
  } else if (!shouldPost) {
    suppressedReason = 'post_cooldown_active';
  } else if (!shouldNotify) {
    suppressedReason = 'notify_cooldown_active';
  }

  return {
    shouldPost,
    shouldNotify,
    shouldCreateIncidentIssue,
    suppressedReason,
  };
}

/**
 * Check if severity escalated
 */
function isSeverityEscalation(
  previous: string,
  current: string
): boolean {
  const order = { ok: 0, info: 1, warn: 2, critical: 3 };
  const prevOrder = order[previous as keyof typeof order] ?? 0;
  const currOrder = order[current as keyof typeof order] ?? 0;
  return currOrder > prevOrder;
}

/**
 * Check if we should create an incident issue
 */
function shouldCreateIssue(
  existing: IncidentState | null,
  current: IncidentState,
  config: IncidentConfig
): boolean {
  // Feature must be enabled
  if (!config.createIssueOnCritical) {
    return false;
  }

  // Must be critical
  if (current.severity !== 'critical') {
    return false;
  }

  // Must not already have an issue
  if (current.incidentIssueCreatedAt) {
    return false;
  }

  // Must have persisted for criticalPersistMinutes
  if (!existing) {
    return false;
  }

  const firstSeen = new Date(existing.firstSeen);
  const now = new Date();
  const persistMs = config.criticalPersistMinutes * 60 * 1000;

  return now.getTime() - firstSeen.getTime() >= persistMs;
}

/**
 * Redact reasons
 */
function redactReasons(reasons: string[], config: IncidentConfig): string[] {
  if (!config.redaction.enabled) {
    return reasons;
  }
  return reasons.map((r) =>
    redact(r, { patterns: config.redaction.patterns })
  );
}

/**
 * Mark incident as having an issue created
 */
export async function markIncidentIssueCreated(
  store: IIncidentStateStore,
  incidentKey: string,
  issueNumber: number
): Promise<void> {
  const state = await store.get(incidentKey);
  if (!state) return;

  await store.set({
    ...state,
    incidentIssueCreatedAt: new Date().toISOString(),
    incidentIssueNumber: issueNumber,
  });
}

/**
 * Resolve an incident manually
 */
export async function resolveIncident(
  store: IIncidentStateStore,
  incidentKey: string
): Promise<IncidentState | null> {
  const state = await store.get(incidentKey);
  if (!state) return null;

  const updated: IncidentState = {
    ...state,
    currentStatus: 'resolved',
    lastSeen: new Date().toISOString(),
  };

  await store.set(updated);
  return updated;
}
