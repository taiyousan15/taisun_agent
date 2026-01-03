/**
 * Jobs Module - P12 Stub
 *
 * Durable job store with idempotency, status tracking, queue, and DLQ.
 */

export {
  JobStoreService,
  InMemoryJobStore,
  generateJobId,
  generateJobKey,
  getJobStore,
  setJobStore,
  clearJobStore,
} from './store';
export { JsonlJobStore } from './jsonl-store';
export { JobQueue } from './queue';
export type { QueueConfig, DLQConfig, QueueStats } from './queue';
export type {
  Job,
  JobStatus,
  JobPriority,
  JobStats,
  JobStoreAdapter,
  DLQEntry,
  CreateJobOptions,
  ListJobsOptions,
} from './types';
