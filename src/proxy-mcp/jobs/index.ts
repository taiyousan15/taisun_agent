/**
 * Jobs Module - P12
 *
 * Durable job store with idempotency, status tracking, queue, and DLQ.
 */

export {
  JobStoreService,
  generateJobId,
  generateJobKey,
  getJobStore,
  setJobStore,
  clearJobStore,
} from './store';

export { InMemoryJobStore } from './stores/inmemory';
export { JsonlJobStore } from './stores/jsonl';
export { JobQueue } from './queue';
export { JobWorker, defaultExecutor, createSupervisorExecutor } from './worker';
export { ApprovalWatcher, createMockGitHubAPI, createGitHubAPI } from './watcher';

export type {
  Job,
  JobStatus,
  JobPriority,
  JobResult,
  JobStats,
  JobStoreAdapter,
  JobStoreConfig,
  CreateJobOptions,
  ListJobsOptions,
} from './types';

export type { QueueConfig, DLQConfig, QueueStats, DLQEntry } from './queue';
export type { WorkerConfig, JobExecutor, JobExecutionResult, WorkerStats } from './worker';
export type { WatcherConfig, GitHubAPI, ApprovalCheckResult } from './watcher';
