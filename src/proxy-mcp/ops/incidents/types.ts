/**
 * Incident Lifecycle Types - P17
 *
 * Types for incident correlation, state management, and noise reduction
 */

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'critical' | 'warn' | 'info' | 'ok';

/**
 * Incident status
 */
export type IncidentStatus = 'active' | 'resolved' | 'suppressed';

/**
 * Configuration for incident correlation
 */
export interface CorrelationConfig {
  includeSeverity: boolean;
  includeReasons: boolean;
  includeComponents: boolean;
  maxReasonsForKey: number;
}

/**
 * Configuration for weekly digest
 */
export interface WeeklyDigestConfig {
  enabled: boolean;
  createIssue: boolean;
  dayOfWeek: number;
  topCauses: number;
  lookbackDays: number;
}

/**
 * Configuration for state store
 */
export interface StateStoreConfig {
  type: 'jsonl' | 'memory';
  path: string;
  maxEntries: number;
  retentionDays: number;
}

/**
 * Redaction configuration
 */
export interface RedactionConfig {
  enabled: boolean;
  patterns: string[];
}

/**
 * Full incident configuration
 */
export interface IncidentConfig {
  enabled: boolean;
  createIssueOnCritical: boolean;
  criticalPersistMinutes: number;
  incidentCooldownMinutes: number;
  correlationConfig: CorrelationConfig;
  weeklyDigest: WeeklyDigestConfig;
  stateStore: StateStoreConfig;
  redaction: RedactionConfig;
}

/**
 * Default incident configuration
 */
export const DEFAULT_INCIDENT_CONFIG: IncidentConfig = {
  enabled: true,
  createIssueOnCritical: false,
  criticalPersistMinutes: 60,
  incidentCooldownMinutes: 120,
  correlationConfig: {
    includeSeverity: true,
    includeReasons: true,
    includeComponents: true,
    maxReasonsForKey: 3,
  },
  weeklyDigest: {
    enabled: false,
    createIssue: false,
    dayOfWeek: 1,
    topCauses: 3,
    lookbackDays: 7,
  },
  stateStore: {
    type: 'jsonl',
    path: '.taisun/incidents/state.jsonl',
    maxEntries: 10000,
    retentionDays: 30,
  },
  redaction: {
    enabled: true,
    patterns: [],
  },
};

/**
 * Input data for generating correlation key
 */
export interface CorrelationInput {
  severity: IncidentSeverity;
  reasons: string[];
  components: string[];
  signals?: string[];
}

/**
 * Incident state record (persisted)
 */
export interface IncidentState {
  /** Unique correlation key (hash) */
  incidentKey: string;

  /** First occurrence timestamp */
  firstSeen: string;

  /** Most recent occurrence timestamp */
  lastSeen: string;

  /** Current status */
  currentStatus: IncidentStatus;

  /** Last severity level */
  severity: IncidentSeverity;

  /** Timestamp of last issue post */
  lastPostedAt: string | null;

  /** Timestamp of last notification */
  lastNotifiedAt: string | null;

  /** Timestamp of incident issue creation (if any) */
  incidentIssueCreatedAt: string | null;

  /** Issue number (if created) */
  incidentIssueNumber: number | null;

  /** Number of occurrences */
  occurrenceCount: number;

  /** Top reasons (redacted) */
  topReasons: string[];

  /** Affected components */
  affectedComponents: string[];

  /** Summary (redacted) */
  summary: string;
}

/**
 * Result of checking if action should be taken
 */
export interface ActionDecision {
  shouldPost: boolean;
  shouldNotify: boolean;
  shouldCreateIncidentIssue: boolean;
  suppressedReason: string | null;
}

/**
 * Incident summary for external output
 */
export interface IncidentSummary {
  incidentKey: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  topReasons: string[];
  affectedComponents: string[];
  summary: string;
  refId?: string;
}

/**
 * Weekly digest data
 */
export interface WeeklyDigestData {
  periodStart: string;
  periodEnd: string;
  totalIncidents: number;
  criticalCount: number;
  warnCount: number;
  resolvedCount: number;
  topCauses: TopCause[];
  recommendedActions: RecommendedAction[];
}

/**
 * Top cause in digest
 */
export interface TopCause {
  reason: string;
  count: number;
  percentage: number;
  affectedComponents: string[];
}

/**
 * Recommended action in digest
 */
export interface RecommendedAction {
  priority: 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  relatedCauses: string[];
}

/**
 * State store interface
 */
export interface IIncidentStateStore {
  get(incidentKey: string): Promise<IncidentState | null>;
  set(state: IncidentState): Promise<void>;
  getAll(): Promise<IncidentState[]>;
  getByStatus(status: IncidentStatus): Promise<IncidentState[]>;
  getBySeverity(severity: IncidentSeverity): Promise<IncidentState[]>;
  getRecent(days: number): Promise<IncidentState[]>;
  cleanup(retentionDays: number): Promise<number>;
}
