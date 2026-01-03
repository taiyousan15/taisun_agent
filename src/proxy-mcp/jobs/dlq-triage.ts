/**
 * DLQ Triage Module - P13
 *
 * Provides summarized view of DLQ entries and issue creation helper.
 * Redacts sensitive data before exposing to external systems.
 */

import { JobQueue, DLQEntry } from './queue';

/**
 * DLQ triage summary
 */
export interface DLQTriageSummary {
  totalCount: number;
  entries: DLQTriageEntry[];
  failureReasonSummary: Array<{ reason: string; count: number }>;
  oldestEntry?: string;
  newestEntry?: string;
}

/**
 * Summarized DLQ entry (redacted)
 */
export interface DLQTriageEntry {
  jobId: string;
  entrypoint: string;
  refId?: string;
  reason: string;
  addedAt: string;
  attempts: number;
}

/**
 * Issue body for DLQ triage
 */
export interface DLQTriageIssueBody {
  title: string;
  body: string;
  labels: string[];
}

// Patterns to redact sensitive data
const REDACTION_PATTERNS = [
  { pattern: /(?:token|key|secret|password|auth|bearer)[:\s=]["']?[a-zA-Z0-9_./+=-]{10,}/gi, replacement: '[REDACTED_CREDENTIAL]' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GH_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GH_OAUTH]' },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /xoxb-[a-zA-Z0-9-]+/g, replacement: '[REDACTED_SLACK_BOT]' },
  { pattern: /xoxp-[a-zA-Z0-9-]+/g, replacement: '[REDACTED_SLACK_USER]' },
  { pattern: /postgresql:\/\/[^@]+@[^/]+/gi, replacement: '[REDACTED_DB_DSN]' },
  { pattern: /mongodb:\/\/[^@]+@[^/]+/gi, replacement: '[REDACTED_DB_DSN]' },
  { pattern: /https?:\/\/[^@]+@[^/\s]+/gi, replacement: '[REDACTED_URL_WITH_CREDS]' },
];

/**
 * Redact sensitive data from text
 */
export function redactSensitiveData(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate DLQ triage summary
 */
export function generateTriageSummary(queue: JobQueue): DLQTriageSummary {
  const dlqEntries = queue.getDLQ();

  if (dlqEntries.length === 0) {
    return {
      totalCount: 0,
      entries: [],
      failureReasonSummary: [],
    };
  }

  // Sort by addedAt descending (newest first)
  const sorted = [...dlqEntries].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );

  // Create summarized entries (redacted)
  const entries: DLQTriageEntry[] = sorted.slice(0, 20).map((entry) => ({
    jobId: entry.job.id,
    entrypoint: entry.job.entrypoint,
    refId: entry.job.refId,
    reason: truncate(redactSensitiveData(entry.reason), 100),
    addedAt: entry.addedAt,
    attempts: entry.job.attempts,
  }));

  // Group failure reasons
  const reasonCounts = new Map<string, number>();
  for (const entry of dlqEntries) {
    const normalizedReason = truncate(redactSensitiveData(entry.reason), 50);
    reasonCounts.set(normalizedReason, (reasonCounts.get(normalizedReason) || 0) + 1);
  }
  const failureReasonSummary = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalCount: dlqEntries.length,
    entries,
    failureReasonSummary,
    oldestEntry: sorted[sorted.length - 1]?.addedAt,
    newestEntry: sorted[0]?.addedAt,
  };
}

/**
 * Generate issue body for DLQ triage
 */
export function generateTriageIssueBody(summary: DLQTriageSummary): DLQTriageIssueBody {
  const title = `[DLQ Triage] ${summary.totalCount} jobs require attention`;

  const lines: string[] = [];
  lines.push('## DLQ Triage Report');
  lines.push('');
  lines.push(`**Total Jobs in DLQ:** ${summary.totalCount}`);
  if (summary.oldestEntry) {
    lines.push(`**Oldest Entry:** ${summary.oldestEntry}`);
  }
  if (summary.newestEntry) {
    lines.push(`**Newest Entry:** ${summary.newestEntry}`);
  }
  lines.push('');

  // Failure reason summary
  if (summary.failureReasonSummary.length > 0) {
    lines.push('### Failure Reasons');
    lines.push('');
    lines.push('| Reason | Count |');
    lines.push('|--------|-------|');
    for (const { reason, count } of summary.failureReasonSummary) {
      lines.push(`| ${reason} | ${count} |`);
    }
    lines.push('');
  }

  // Recent entries
  if (summary.entries.length > 0) {
    lines.push('### Recent Entries (up to 20)');
    lines.push('');
    lines.push('| Job ID | Entrypoint | Attempts | Added |');
    lines.push('|--------|------------|----------|-------|');
    for (const entry of summary.entries.slice(0, 10)) {
      const shortId = entry.jobId.substring(0, 16);
      const date = entry.addedAt.substring(0, 10);
      lines.push(`| \`${shortId}\` | ${entry.entrypoint} | ${entry.attempts} | ${date} |`);
    }
    lines.push('');
  }

  // Action items
  lines.push('### Recommended Actions');
  lines.push('');
  lines.push('1. Review failure reasons above to identify patterns');
  lines.push('2. Check system logs for more context on failures');
  lines.push('3. For transient failures, consider retry with:');
  lines.push('   ```bash');
  lines.push('   npm run jobs:dlq:retry -- --job-id <JOB_ID>');
  lines.push('   ```');
  lines.push('4. For permanent failures, clear with:');
  lines.push('   ```bash');
  lines.push('   npm run jobs:dlq:clear -- --job-id <JOB_ID>');
  lines.push('   ```');
  lines.push('');
  lines.push('---');
  lines.push('_Generated by DLQ Triage CLI_');

  return {
    title,
    body: lines.join('\n'),
    labels: ['dlq-triage', 'ops', 'automated'],
  };
}

/**
 * Format triage summary for console output
 */
export function formatTriageSummaryForConsole(summary: DLQTriageSummary): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('DLQ Triage Summary');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Total Jobs: ${summary.totalCount}`);

  if (summary.oldestEntry) {
    lines.push(`Oldest:     ${summary.oldestEntry}`);
  }
  if (summary.newestEntry) {
    lines.push(`Newest:     ${summary.newestEntry}`);
  }
  lines.push('');

  if (summary.failureReasonSummary.length > 0) {
    lines.push('Top Failure Reasons:');
    lines.push('-'.repeat(40));
    for (const { reason, count } of summary.failureReasonSummary.slice(0, 5)) {
      lines.push(`  ${count}x ${reason}`);
    }
    lines.push('');
  }

  if (summary.entries.length > 0) {
    lines.push('Recent Entries:');
    lines.push('-'.repeat(40));
    for (const entry of summary.entries.slice(0, 5)) {
      lines.push(`  ${entry.jobId.substring(0, 16)}  ${entry.entrypoint}  (${entry.attempts} attempts)`);
      lines.push(`    └─ ${entry.reason}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
