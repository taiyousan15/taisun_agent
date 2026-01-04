/**
 * Incident Summary Generation - P17
 *
 * Creates concise summaries for external output
 */

import { redact } from './redact';
import type {
  IIncidentStateStore,
  IncidentConfig,
  IncidentState,
  IncidentSummary,
} from './types';

/**
 * Generate a summary for a single incident
 */
export function generateIncidentSummary(
  state: IncidentState,
  refId?: string
): IncidentSummary {
  return {
    incidentKey: state.incidentKey,
    severity: state.severity,
    status: state.currentStatus,
    firstSeen: state.firstSeen,
    lastSeen: state.lastSeen,
    occurrenceCount: state.occurrenceCount,
    topReasons: state.topReasons,
    affectedComponents: state.affectedComponents,
    summary: state.summary,
    refId,
  };
}

/**
 * Generate markdown summary for an incident
 */
export function incidentToMarkdown(summary: IncidentSummary): string {
  const lines: string[] = [];

  const statusEmoji = {
    active: '🔴',
    resolved: '✅',
    suppressed: '⏸️',
  }[summary.status];

  const severityEmoji = {
    critical: '🚨',
    warn: '⚠️',
    info: 'ℹ️',
    ok: '✅',
  }[summary.severity];

  lines.push(`## ${statusEmoji} Incident: ${summary.incidentKey.substring(0, 8)}`);
  lines.push('');
  lines.push(`**Severity**: ${severityEmoji} ${summary.severity.toUpperCase()}`);
  lines.push(`**Status**: ${summary.status}`);
  lines.push(`**First Seen**: ${summary.firstSeen}`);
  lines.push(`**Last Seen**: ${summary.lastSeen}`);
  lines.push(`**Occurrences**: ${summary.occurrenceCount}`);
  lines.push('');

  if (summary.topReasons.length > 0) {
    lines.push('### Top Reasons');
    for (const reason of summary.topReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (summary.affectedComponents.length > 0) {
    lines.push('### Affected Components');
    lines.push(summary.affectedComponents.join(', '));
    lines.push('');
  }

  if (summary.refId) {
    lines.push(`📎 **Reference**: \`${summary.refId}\``);
  }

  return lines.join('\n');
}

/**
 * Generate a compact one-line summary
 */
export function incidentToOneLiner(summary: IncidentSummary): string {
  const statusEmoji = {
    active: '🔴',
    resolved: '✅',
    suppressed: '⏸️',
  }[summary.status];

  const parts = [
    `${statusEmoji} [${summary.severity.toUpperCase()}]`,
    `${summary.incidentKey.substring(0, 8)}`,
    `x${summary.occurrenceCount}`,
  ];

  if (summary.topReasons.length > 0) {
    parts.push(summary.topReasons[0]);
  }

  return parts.join(' | ');
}

/**
 * Generate active incidents summary
 */
export async function generateActiveIncidentsSummary(
  store: IIncidentStateStore,
  config: IncidentConfig
): Promise<string> {
  const active = await store.getByStatus('active');

  if (active.length === 0) {
    return '✅ No active incidents';
  }

  const lines: string[] = [];
  lines.push(`## 🔴 Active Incidents (${active.length})`);
  lines.push('');

  // Sort by severity (critical first) then by lastSeen
  const sorted = active.sort((a, b) => {
    const severityOrder = { critical: 0, warn: 1, info: 2, ok: 3 };
    const aSev = severityOrder[a.severity] ?? 3;
    const bSev = severityOrder[b.severity] ?? 3;
    if (aSev !== bSev) return aSev - bSev;
    return b.lastSeen.localeCompare(a.lastSeen);
  });

  for (const state of sorted.slice(0, 10)) {
    const summary = generateIncidentSummary(state);
    lines.push(incidentToOneLiner(summary));
  }

  if (sorted.length > 10) {
    lines.push(`... and ${sorted.length - 10} more`);
  }

  return lines.join('\n');
}

/**
 * Generate recent incidents summary (for digest)
 */
export async function generateRecentIncidentsSummary(
  store: IIncidentStateStore,
  days: number,
  config: IncidentConfig
): Promise<{
  totalCount: number;
  criticalCount: number;
  warnCount: number;
  resolvedCount: number;
  activeCount: number;
  topReasons: Map<string, number>;
  topComponents: Map<string, number>;
}> {
  const recent = await store.getRecent(days);

  const topReasons = new Map<string, number>();
  const topComponents = new Map<string, number>();

  let criticalCount = 0;
  let warnCount = 0;
  let resolvedCount = 0;
  let activeCount = 0;

  for (const state of recent) {
    // Count by severity
    if (state.severity === 'critical') criticalCount++;
    else if (state.severity === 'warn') warnCount++;

    // Count by status
    if (state.currentStatus === 'resolved') resolvedCount++;
    else if (state.currentStatus === 'active') activeCount++;

    // Aggregate reasons
    for (const reason of state.topReasons) {
      topReasons.set(reason, (topReasons.get(reason) || 0) + 1);
    }

    // Aggregate components
    for (const component of state.affectedComponents) {
      topComponents.set(component, (topComponents.get(component) || 0) + 1);
    }
  }

  return {
    totalCount: recent.length,
    criticalCount,
    warnCount,
    resolvedCount,
    activeCount,
    topReasons,
    topComponents,
  };
}

/**
 * Redact an incident summary
 */
export function redactSummary(
  summary: IncidentSummary,
  patterns: string[] = []
): IncidentSummary {
  return {
    ...summary,
    topReasons: summary.topReasons.map((r) => redact(r, { patterns })),
    summary: redact(summary.summary, { patterns }),
  };
}
