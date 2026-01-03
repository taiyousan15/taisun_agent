/**
 * Job Queue - P12 Stub
 *
 * Minimal queue implementation for SLO evaluation
 */

import type { Job, DLQEntry, JobStoreAdapter } from './types';

export interface QueueConfig {
  maxSize: number;
  dlqEnabled: boolean;
  dlqMaxSize: number;
}

export interface DLQConfig {
  maxSize: number;
  retryAttempts: number;
}

export interface QueueStats {
  queueSize: number;
  dlqSize: number;
  processingJobs: number;
}

/**
 * Job Queue with DLQ
 */
export class JobQueue {
  private dlq: DLQEntry[] = [];

  constructor(private store: JobStoreAdapter) {}

  /**
   * Get DLQ entries
   */
  getDLQ(): DLQEntry[] {
    return [...this.dlq];
  }

  /**
   * Add job to DLQ
   */
  addToDLQ(job: Job, reason: string): void {
    const existing = this.dlq.find((e) => e.jobId === job.id);
    if (existing) {
      existing.attempts++;
      existing.reason = reason;
    } else {
      this.dlq.push({
        jobId: job.id,
        job,
        reason,
        addedAt: new Date().toISOString(),
        attempts: 1,
      });
    }
  }

  /**
   * Remove from DLQ
   */
  removeFromDLQ(jobId: string): boolean {
    const index = this.dlq.findIndex((e) => e.jobId === jobId);
    if (index >= 0) {
      this.dlq.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear DLQ
   */
  clearDLQ(): void {
    this.dlq = [];
  }

  /**
   * Get queue stats
   */
  async getStats(): Promise<QueueStats> {
    const stats = await this.store.getStats();
    return {
      queueSize: stats.queued,
      dlqSize: this.dlq.length,
      processingJobs: stats.running,
    };
  }
}
