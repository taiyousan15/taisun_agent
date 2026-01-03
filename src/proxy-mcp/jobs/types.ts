/**
 * Job Types - P12
 *
 * Types for durable job store and execution.
 */

/**
 * Job status
 */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'succeeded'
  | 'failed'
  | 'canceled';

/**
 * Job priority
 */
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Job record
 */
export interface Job {
  /** Unique job ID */
  id: string;
  /** Job key for idempotency (planHash + entrypoint + paramsHash) */
  jobKey: string;
  /** Current status */
  status: JobStatus;
  /** Priority level */
  priority: JobPriority;
  /** Entry point (e.g., 'supervisor', 'mcp-call') */
  entrypoint: string;
  /** Input parameters */
  params: Record<string, unknown>;
  /** Plan hash for approval binding */
  planHash?: string;
  /** Memory reference ID for tracking */
  refId?: string;
  /** GitHub issue ID for approval */
  issueId?: number;
  /** Number of attempts */
  attempts: number;
  /** Maximum attempts before DLQ */
  maxAttempts: number;
  /** Last error message */
  lastError?: string;
  /** Result data (on success) */
  result?: JobResult;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** Started timestamp (first run) */
  startedAt?: string;
  /** Completed timestamp */
  completedAt?: string;
  /** TTL for approval (ISO string) */
  approvalExpiresAt?: string;
}

/**
 * Job result
 */
export interface JobResult {
  success: boolean;
  summary: string;
  refId?: string;
  data?: Record<string, unknown>;
}

/**
 * Job creation options
 */
export interface CreateJobOptions {
  /** Entry point */
  entrypoint: string;
  /** Input parameters */
  params: Record<string, unknown>;
  /** Plan hash for approval binding */
  planHash?: string;
  /** Priority (default: normal) */
  priority?: JobPriority;
  /** Maximum attempts (default: 3) */
  maxAttempts?: number;
  /** Memory reference ID */
  refId?: string;
  /** Approval TTL hours */
  approvalTtlHours?: number;
}

/**
 * Job store adapter interface
 */
export interface JobStoreAdapter {
  /** Initialize the store */
  init(): Promise<void>;
  /** Get a job by ID */
  get(id: string): Promise<Job | null>;
  /** Get a job by job key (idempotency) */
  getByKey(jobKey: string): Promise<Job | null>;
  /** Create a new job */
  create(job: Job): Promise<Job>;
  /** Update a job */
  update(id: string, updates: Partial<Job>): Promise<Job | null>;
  /** Delete a job */
  delete(id: string): Promise<boolean>;
  /** List jobs by status */
  listByStatus(status: JobStatus, limit?: number): Promise<Job[]>;
  /** List all jobs (with pagination) */
  list(options?: ListJobsOptions): Promise<Job[]>;
  /** Count jobs by status */
  countByStatus(status: JobStatus): Promise<number>;
  /** Get jobs waiting for approval that are about to expire */
  getExpiringApprovals(thresholdMs: number): Promise<Job[]>;
  /** Close the store */
  close(): Promise<void>;
}

/**
 * List jobs options
 */
export interface ListJobsOptions {
  status?: JobStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'priority';
  orderDir?: 'asc' | 'desc';
}

/**
 * Job store configuration
 */
export interface JobStoreConfig {
  /** Store type */
  type: 'inmemory' | 'jsonl';
  /** JSONL file path (for jsonl type) */
  filePath?: string;
  /** Auto-save interval in ms (for jsonl type) */
  autoSaveIntervalMs?: number;
}

/**
 * Job statistics
 */
export interface JobStats {
  queued: number;
  running: number;
  waiting_approval: number;
  succeeded: number;
  failed: number;
  canceled: number;
  total: number;
}
