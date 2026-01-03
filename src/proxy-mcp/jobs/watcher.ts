/**
 * Approval Watcher - P12
 *
 * Watches for job approvals via GitHub issues:
 * - Polls GitHub issue labels for approval
 * - Auto-resumes approved jobs
 * - Auto-declines expired jobs (TTL exceeded)
 * - Disabled when GitHub API is unavailable
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { Job } from './types';
import { JobQueue } from './queue';
import { JobStoreService } from './store';

/**
 * Watcher configuration
 */
export interface WatcherConfig {
  /** Poll interval in ms */
  pollIntervalMs: number;
  /** Expiry warning threshold in hours */
  expiryWarningHours: number;
  /** Enable watcher */
  enabled: boolean;
}

/**
 * GitHub API interface (for dependency injection)
 */
export interface GitHubAPI {
  /** Check if GitHub CLI is available */
  isAvailable(): Promise<boolean>;
  /** Check if issue has approval label */
  checkApproval(issueId: number): Promise<{ approved: boolean; label?: string }>;
  /** Add comment to issue */
  addComment(issueId: number, comment: string): Promise<void>;
  /** Close issue */
  closeIssue(issueId: number): Promise<void>;
}

/**
 * Approval check result
 */
export interface ApprovalCheckResult {
  job: Job;
  approved: boolean;
  expired: boolean;
  expiresInHours?: number;
}

/**
 * Approval Watcher
 */
export class ApprovalWatcher extends EventEmitter {
  private queue: JobQueue;
  private store: JobStoreService;
  private github: GitHubAPI;
  private config: WatcherConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private available: boolean = false;

  constructor(
    queue: JobQueue,
    store: JobStoreService,
    github: GitHubAPI,
    config: Partial<WatcherConfig> = {}
  ) {
    super();
    this.queue = queue;
    this.store = store;
    this.github = github;
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? 30000, // 30 seconds
      expiryWarningHours: config.expiryWarningHours ?? 1,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Start the watcher
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.emit('disabled', 'Watcher is disabled in config');
      return;
    }

    // Check GitHub availability
    this.available = await this.github.isAvailable();
    if (!this.available) {
      this.emit('disabled', 'GitHub API is not available');
      return;
    }

    if (this.running) return;

    this.running = true;

    // Start polling loop
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        this.emit('error', err);
      });
    }, this.config.pollIntervalMs);

    // Initial poll
    await this.poll();

    this.emit('started');
  }

  /**
   * Stop the watcher
   */
  stop(): void {
    if (!this.running) return;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.running = false;
    this.emit('stopped');
  }

  /**
   * Poll for approval updates
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      // Get all jobs waiting for approval
      const jobs = await this.store.getWaitingApprovalJobs();

      for (const job of jobs) {
        if (!job.issueId) continue;

        const result = await this.checkJob(job);

        if (result.approved) {
          await this.handleApproval(job);
        } else if (result.expired) {
          await this.handleExpiry(job);
        } else if (result.expiresInHours !== undefined) {
          // Check for expiry warning
          if (result.expiresInHours <= this.config.expiryWarningHours) {
            this.emit('warning:expiring', job, result.expiresInHours);
          }
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Check a single job for approval/expiry
   */
  async checkJob(job: Job): Promise<ApprovalCheckResult> {
    // Check expiry first
    if (job.approvalExpiresAt) {
      const expiresAt = new Date(job.approvalExpiresAt).getTime();
      const now = Date.now();

      if (now >= expiresAt) {
        return { job, approved: false, expired: true };
      }

      const expiresInMs = expiresAt - now;
      const expiresInHours = expiresInMs / (60 * 60 * 1000);

      // Check GitHub approval
      if (job.issueId) {
        const { approved } = await this.github.checkApproval(job.issueId);
        return { job, approved, expired: false, expiresInHours };
      }

      return { job, approved: false, expired: false, expiresInHours };
    }

    // No expiry set, just check approval
    if (job.issueId) {
      const { approved } = await this.github.checkApproval(job.issueId);
      return { job, approved, expired: false };
    }

    return { job, approved: false, expired: false };
  }

  /**
   * Handle approved job
   */
  private async handleApproval(job: Job): Promise<void> {
    // Resume the job
    await this.queue.resume(job.id);

    // Add comment to issue
    if (job.issueId) {
      try {
        await this.github.addComment(
          job.issueId,
          `✅ Approval detected. Job \`${job.id}\` has been resumed.`
        );
      } catch {
        // Ignore comment errors
      }
    }

    this.emit('job:approved', job);
  }

  /**
   * Handle expired job
   */
  private async handleExpiry(job: Job): Promise<void> {
    // Fail the job
    await this.store.failJob(job.id, 'Approval TTL expired');

    // Add comment and close issue
    if (job.issueId) {
      try {
        await this.github.addComment(
          job.issueId,
          `⏰ Approval timeout. Job \`${job.id}\` has been auto-declined.`
        );
        await this.github.closeIssue(job.issueId);
      } catch {
        // Ignore GitHub errors
      }
    }

    this.emit('job:expired', job);
  }

  /**
   * Force check a specific job
   */
  async forceCheck(jobId: string): Promise<ApprovalCheckResult | null> {
    const job = await this.store.getJob(jobId);
    if (!job || job.status !== 'waiting_approval') {
      return null;
    }

    const result = await this.checkJob(job);

    if (result.approved) {
      await this.handleApproval(job);
    } else if (result.expired) {
      await this.handleExpiry(job);
    }

    return result;
  }

  /**
   * Get expiring jobs
   */
  async getExpiringJobs(): Promise<Job[]> {
    const thresholdMs = this.config.expiryWarningHours * 60 * 60 * 1000;
    return this.store.getExpiringApprovals(thresholdMs);
  }

  /**
   * Is watcher running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Is GitHub available
   */
  isGitHubAvailable(): boolean {
    return this.available;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<WatcherConfig> {
    return { ...this.config };
  }
}

/**
 * Create a mock GitHub API (for testing)
 */
export function createMockGitHubAPI(
  options: {
    available?: boolean;
    approvedIssues?: Set<number>;
  } = {}
): GitHubAPI {
  const approvedIssues = options.approvedIssues ?? new Set();

  return {
    async isAvailable() {
      return options.available ?? true;
    },
    async checkApproval(issueId: number) {
      const approved = approvedIssues.has(issueId);
      return { approved, label: approved ? 'approved' : undefined };
    },
    async addComment(_issueId: number, _comment: string) {
      // No-op
    },
    async closeIssue(_issueId: number) {
      // No-op
    },
  };
}

/**
 * Create a real GitHub API using gh CLI
 */
export function createGitHubAPI(repo?: string): GitHubAPI {
  const getRepo = () => {
    if (repo) return repo;
    try {
      const output = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
        encoding: 'utf-8',
      }).trim();
      return output;
    } catch {
      return null;
    }
  };

  return {
    async isAvailable() {
      try {
        execSync('gh auth status', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },

    async checkApproval(issueId: number) {
      const repoName = getRepo();
      if (!repoName) {
        return { approved: false };
      }

      try {
        const output = execSync(
          `gh issue view ${issueId} --repo ${repoName} --json labels -q '.labels[].name'`,
          { encoding: 'utf-8' }
        );
        const labels = output.split('\n').filter(Boolean);
        const approved = labels.some((l) =>
          ['approved', 'plan-approved', 'lgtm'].includes(l.toLowerCase())
        );
        return { approved, label: labels.find((l) => l.toLowerCase().includes('approv')) };
      } catch {
        return { approved: false };
      }
    },

    async addComment(issueId: number, comment: string) {
      const repoName = getRepo();
      if (!repoName) return;

      try {
        execSync(`gh issue comment ${issueId} --repo ${repoName} --body "${comment}"`, {
          stdio: 'ignore',
        });
      } catch {
        // Ignore errors
      }
    },

    async closeIssue(issueId: number) {
      const repoName = getRepo();
      if (!repoName) return;

      try {
        execSync(`gh issue close ${issueId} --repo ${repoName}`, { stdio: 'ignore' });
      } catch {
        // Ignore errors
      }
    },
  };
}
