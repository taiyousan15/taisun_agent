/**
 * Incidents Module - P17
 *
 * Incident correlation, state management, and noise reduction
 */

// Types
export type {
  IncidentSeverity,
  IncidentStatus,
  CorrelationConfig,
  WeeklyDigestConfig,
  StateStoreConfig,
  RedactionConfig,
  IncidentConfig,
  CorrelationInput,
  IncidentState,
  ActionDecision,
  IncidentSummary,
  WeeklyDigestData,
  TopCause,
  RecommendedAction,
  IIncidentStateStore,
} from './types';
export { DEFAULT_INCIDENT_CONFIG } from './types';

// Correlation
export {
  generateCorrelationKey,
  extractReasons,
  extractComponents,
  determineSeverity,
  buildCorrelationInput,
  keysMatch,
  correlationSummary,
} from './correlate';

// State Store
export {
  JsonlIncidentStateStore,
  InMemoryIncidentStateStore,
  createStateStore,
} from './state-store';

// Update Logic
export {
  updateIncidentState,
  markIncidentIssueCreated,
  resolveIncident,
} from './update';

// Summary
export {
  generateIncidentSummary,
  incidentToMarkdown,
  incidentToOneLiner,
  generateActiveIncidentsSummary,
  generateRecentIncidentsSummary,
  redactSummary,
} from './summary';

// Redaction (local utility, will be replaced with P16 notify/redact when merged)
export { redact, containsSecrets } from './redact';
export type { RedactOptions } from './redact';

// Incident Issue Creation (P17-4)
export {
  shouldCreateIncidentIssue,
  createIncidentIssue,
  processIncidentIssueCreation,
  MockGitHubIssueAPI,
} from './create-issue';
export type {
  GitHubIssueAPI,
  CreateIncidentIssueResult,
} from './create-issue';
