/**
 * Weekly Digest Generation - P17
 *
 * Generates weekly improvement digests from incident data
 */

import type { IIncidentStateStore, IncidentState } from '../incidents/types';
import type {
  DigestConfig,
  WeeklyDigest,
  TopCause,
  RecommendedAction,
  DigestGenerationResult,
} from './types';
import { DEFAULT_DIGEST_CONFIG } from './types';

/**
 * Known patterns and their recommended actions
 */
const KNOWN_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  rationale: string;
  estimatedImpact: string;
  priority: 'high' | 'medium' | 'low';
}> = [
  {
    pattern: /timeout|timed?\s*out/i,
    action: 'Implement retry with exponential backoff',
    rationale: 'Timeout errors often indicate transient network issues that resolve on retry',
    estimatedImpact: 'May reduce timeout-related incidents by 60-80%',
    priority: 'high',
  },
  {
    pattern: /rate\s*limit|429|too\s*many\s*requests/i,
    action: 'Add rate limiting and request queuing',
    rationale: 'Rate limits are often hit due to bursty traffic patterns',
    estimatedImpact: 'Prevents rate limit errors and improves reliability',
    priority: 'high',
  },
  {
    pattern: /connection\s*(refused|reset|closed)/i,
    action: 'Implement circuit breaker pattern',
    rationale: 'Connection failures can cascade; circuit breakers prevent this',
    estimatedImpact: 'Reduces cascade failures and improves recovery time',
    priority: 'high',
  },
  {
    pattern: /memory|out\s*of\s*memory|oom|heap/i,
    action: 'Review memory usage and increase limits or optimize',
    rationale: 'Memory issues often indicate leaks or undersized resources',
    estimatedImpact: 'Prevents OOM crashes and improves stability',
    priority: 'high',
  },
  {
    pattern: /auth|unauthorized|forbidden|401|403/i,
    action: 'Review credential rotation and token refresh logic',
    rationale: 'Auth errors often indicate expired or misconfigured credentials',
    estimatedImpact: 'Reduces auth-related outages',
    priority: 'medium',
  },
  {
    pattern: /parse|json|xml|format|invalid/i,
    action: 'Add input validation and error handling for malformed data',
    rationale: 'Parse errors indicate data format mismatches',
    estimatedImpact: 'Improves robustness to bad input',
    priority: 'medium',
  },
  {
    pattern: /not\s*found|404|missing/i,
    action: 'Add resource existence checks before operations',
    rationale: 'Not found errors often indicate race conditions or stale references',
    estimatedImpact: 'Reduces errors from missing resources',
    priority: 'low',
  },
];

/**
 * Generate weekly digest from incident data
 */
export async function generateWeeklyDigest(
  store: IIncidentStateStore,
  config: Partial<DigestConfig> = {}
): Promise<WeeklyDigest> {
  const cfg: DigestConfig = { ...DEFAULT_DIGEST_CONFIG, ...config };

  // Calculate period
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - cfg.lookbackDays);

  // Get recent incidents
  const incidents = await store.getRecent(cfg.lookbackDays);

  // Calculate summary metrics
  const summary = calculateSummary(incidents);

  // Calculate top causes
  const topCauses = calculateTopCauses(incidents, cfg.topCauses);

  // Generate recommended actions
  const recommendedActions = generateRecommendedActions(topCauses);

  // Calculate component health
  const componentHealth = calculateComponentHealth(incidents);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    summary,
    topCauses,
    recommendedActions,
    componentHealth,
  };
}

/**
 * Calculate summary metrics
 */
function calculateSummary(incidents: IncidentState[]): WeeklyDigest['summary'] {
  let criticalCount = 0;
  let warnCount = 0;
  let infoCount = 0;
  let resolvedCount = 0;
  let activeCount = 0;
  let totalResolutionTime = 0;
  let resolvedWithTime = 0;

  for (const incident of incidents) {
    // Count by severity
    switch (incident.severity) {
      case 'critical':
        criticalCount++;
        break;
      case 'warn':
        warnCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }

    // Count by status
    if (incident.currentStatus === 'resolved') {
      resolvedCount++;
      // Calculate resolution time
      const first = new Date(incident.firstSeen);
      const last = new Date(incident.lastSeen);
      const resolutionMs = last.getTime() - first.getTime();
      if (resolutionMs > 0) {
        totalResolutionTime += resolutionMs;
        resolvedWithTime++;
      }
    } else if (incident.currentStatus === 'active') {
      activeCount++;
    }
  }

  const avgResolutionTimeMinutes =
    resolvedWithTime > 0
      ? Math.round(totalResolutionTime / resolvedWithTime / 60000)
      : null;

  return {
    totalIncidents: incidents.length,
    criticalCount,
    warnCount,
    infoCount,
    resolvedCount,
    activeCount,
    avgResolutionTimeMinutes,
  };
}

/**
 * Calculate top causes
 */
function calculateTopCauses(
  incidents: IncidentState[],
  topN: number
): TopCause[] {
  // Aggregate reasons
  const reasonStats = new Map<
    string,
    {
      count: number;
      components: Set<string>;
      critical: number;
      warn: number;
      info: number;
    }
  >();

  for (const incident of incidents) {
    for (const reason of incident.topReasons) {
      const normalized = reason.toLowerCase().trim();
      if (!reasonStats.has(normalized)) {
        reasonStats.set(normalized, {
          count: 0,
          components: new Set(),
          critical: 0,
          warn: 0,
          info: 0,
        });
      }

      const stats = reasonStats.get(normalized)!;
      stats.count++;

      for (const comp of incident.affectedComponents) {
        stats.components.add(comp);
      }

      switch (incident.severity) {
        case 'critical':
          stats.critical++;
          break;
        case 'warn':
          stats.warn++;
          break;
        case 'info':
          stats.info++;
          break;
      }
    }
  }

  // Sort by count and take top N
  const sorted = Array.from(reasonStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN);

  const totalReasons = Array.from(reasonStats.values()).reduce(
    (sum, s) => sum + s.count,
    0
  );

  return sorted.map(([reason, stats]) => ({
    reason,
    count: stats.count,
    percentage: totalReasons > 0 ? Math.round((stats.count / totalReasons) * 100) : 0,
    affectedComponents: Array.from(stats.components),
    severityBreakdown: {
      critical: stats.critical,
      warn: stats.warn,
      info: stats.info,
    },
  }));
}

/**
 * Generate recommended actions based on top causes
 */
function generateRecommendedActions(topCauses: TopCause[]): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const usedPatterns = new Set<string>();

  for (const cause of topCauses) {
    for (const known of KNOWN_PATTERNS) {
      if (known.pattern.test(cause.reason) && !usedPatterns.has(known.action)) {
        usedPatterns.add(known.action);
        actions.push({
          priority: known.priority,
          action: known.action,
          rationale: known.rationale,
          relatedCauses: [cause.reason],
          estimatedImpact: known.estimatedImpact,
        });
        break;
      }
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}

/**
 * Calculate component health scores
 */
function calculateComponentHealth(
  incidents: IncidentState[]
): WeeklyDigest['componentHealth'] {
  const componentStats = new Map<string, { total: number; critical: number }>();

  for (const incident of incidents) {
    for (const component of incident.affectedComponents) {
      if (!componentStats.has(component)) {
        componentStats.set(component, { total: 0, critical: 0 });
      }
      const stats = componentStats.get(component)!;
      stats.total++;
      if (incident.severity === 'critical') {
        stats.critical++;
      }
    }
  }

  // Calculate health score (100 = no incidents, 0 = all critical)
  return Array.from(componentStats.entries())
    .map(([component, stats]) => {
      // Simple formula: base 100, minus 10 per incident, minus 20 more per critical
      const incidentPenalty = Math.min(stats.total * 10, 50);
      const criticalPenalty = Math.min(stats.critical * 20, 50);
      const healthScore = Math.max(0, 100 - incidentPenalty - criticalPenalty);

      return {
        component,
        incidentCount: stats.total,
        healthScore,
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore); // Worst health first
}

/**
 * Generate markdown from digest
 */
export function digestToMarkdown(digest: WeeklyDigest): string {
  const lines: string[] = [];

  lines.push('# Weekly Incident Digest');
  lines.push('');
  lines.push(`**Period**: ${digest.periodStart.split('T')[0]} to ${digest.periodEnd.split('T')[0]}`);
  lines.push(`**Generated**: ${digest.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Incidents | ${digest.summary.totalIncidents} |`);
  lines.push(`| Critical | ${digest.summary.criticalCount} |`);
  lines.push(`| Warnings | ${digest.summary.warnCount} |`);
  lines.push(`| Info | ${digest.summary.infoCount} |`);
  lines.push(`| Resolved | ${digest.summary.resolvedCount} |`);
  lines.push(`| Active | ${digest.summary.activeCount} |`);
  if (digest.summary.avgResolutionTimeMinutes !== null) {
    lines.push(`| Avg Resolution Time | ${digest.summary.avgResolutionTimeMinutes} min |`);
  }
  lines.push('');

  // Top Causes
  if (digest.topCauses.length > 0) {
    lines.push('## Top Causes');
    lines.push('');
    for (let i = 0; i < digest.topCauses.length; i++) {
      const cause = digest.topCauses[i];
      lines.push(`### ${i + 1}. ${cause.reason}`);
      lines.push('');
      lines.push(`- **Count**: ${cause.count} (${cause.percentage}%)`);
      lines.push(`- **Severity**: Critical: ${cause.severityBreakdown.critical}, Warn: ${cause.severityBreakdown.warn}, Info: ${cause.severityBreakdown.info}`);
      lines.push(`- **Components**: ${cause.affectedComponents.join(', ') || 'N/A'}`);
      lines.push('');
    }
  }

  // Recommended Actions
  if (digest.recommendedActions.length > 0) {
    lines.push('## Recommended Actions');
    lines.push('');
    for (const action of digest.recommendedActions) {
      const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[action.priority];
      lines.push(`### ${priorityEmoji} ${action.action}`);
      lines.push('');
      lines.push(`**Priority**: ${action.priority.toUpperCase()}`);
      lines.push('');
      lines.push(`**Rationale**: ${action.rationale}`);
      lines.push('');
      lines.push(`**Estimated Impact**: ${action.estimatedImpact}`);
      lines.push('');
      lines.push(`**Related Causes**: ${action.relatedCauses.join(', ')}`);
      lines.push('');
    }
  }

  // Component Health
  if (digest.componentHealth.length > 0) {
    lines.push('## Component Health');
    lines.push('');
    lines.push('| Component | Incidents | Health Score |');
    lines.push('|-----------|-----------|--------------|');
    for (const ch of digest.componentHealth) {
      const healthEmoji = ch.healthScore >= 80 ? '✅' : ch.healthScore >= 50 ? '⚠️' : '🔴';
      lines.push(`| ${ch.component} | ${ch.incidentCount} | ${healthEmoji} ${ch.healthScore}/100 |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Auto-generated by P17 Incident Lifecycle*');

  return lines.join('\n');
}

/**
 * Check if today is the configured digest day
 */
export function isDigestDay(config: DigestConfig): boolean {
  const today = new Date().getDay();
  return today === config.dayOfWeek;
}
