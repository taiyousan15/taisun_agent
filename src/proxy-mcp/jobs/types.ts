/**
 * Jobs Types - P12 Stub
 *
 * Minimal type definitions for job queue system
 */

export type JobStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed';
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Job {
  id: string;
  key?: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: JobPriority;
  createdAt: string;
  updatedAt?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface JobStats {
  queued: number;
  running: number;
  waiting_approval: number;
  succeeded: number;
  failed: number;
  total: number;
}

export interface JobStoreAdapter {
  init(): Promise<void>;
  close(): Promise<void>;
  get(id: string): Promise<Job | undefined>;
  set(job: Job): Promise<void>;
  delete(id: string): Promise<boolean>;
  list(limit?: number, offset?: number): Promise<Job[]>;
  listByStatus(status: JobStatus, limit?: number): Promise<Job[]>;
  findByKey(key: string): Promise<Job | undefined>;
  getStats(): Promise<JobStats>;
}

export interface DLQEntry {
  jobId: string;
  job: Job;
  reason: string;
  addedAt: string;
  attempts: number;
}

export interface CreateJobOptions {
  id?: string;
  key?: string;
  priority?: JobPriority;
  metadata?: Record<string, unknown>;
}

export interface ListJobsOptions {
  status?: JobStatus;
  limit?: number;
  offset?: number;
}
