/**
 * DLQ Triage Assist - P16
 *
 * Provides intelligent guidance when DLQ entries increase.
 * Helps operators understand and resolve issues quickly.
 */

import type { DLQEntry } from '../../jobs/types';
import { redact } from '../notify/redact';

/**
 * Triage guidance level
 */
export type TriageLevel = 'info' | 'warn' | 'critical';

/**
 * Triage recommendation
 */
export interface TriageRecommendation {
  action: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  commands?: string[];
}

/**
 * Failure pattern analysis
 */
export interface FailurePattern {
  pattern: string;
  count: number;
  examples: string[];
  recommendation: TriageRecommendation;
}

/**
 * Triage assist result
 */
export interface TriageAssistResult {
  level: TriageLevel;
  summary: string;
  patterns: FailurePattern[];
  recommendations: TriageRecommendation[];
  markdown: string;
}

/**
 * Common failure patterns and their remedies
 */
const FAILURE_PATTERNS: Array<{
  regex: RegExp;
  category: string;
  recommendation: Omit<TriageRecommendation, 'reason'>;
}> = [
  {
    regex: /rate.?limit|too.?many.?requests|429/i,
    category: 'Rate Limiting',
    recommendation: {
      action: 'Implement exponential backoff or reduce request frequency',
      priority: 'medium',
      commands: ['Check API rate limits', 'Review request frequency settings'],
    },
  },
  {
    regex: /timeout|timed.?out|ETIMEDOUT|ECONNRESET/i,
    category: 'Timeout',
    recommendation: {
      action: 'Increase timeout limits or check downstream service health',
      priority: 'high',
      commands: ['Check service health', 'Review timeout configuration'],
    },
  },
  {
    regex: /connection.?refused|ECONNREFUSED|service.?unavailable|503/i,
    category: 'Service Unavailable',
    recommendation: {
      action: 'Check if downstream service is running and accessible',
      priority: 'high',
      commands: ['docker compose ps', 'Check service logs'],
    },
  },
  {
    regex: /authentication|unauthorized|401|forbidden|403/i,
    category: 'Authentication Error',
    recommendation: {
      action: 'Verify API credentials and tokens',
      priority: 'high',
      commands: ['Check environment variables', 'Regenerate API tokens if expired'],
    },
  },
  {
    regex: /invalid.?json|parse.?error|syntax.?error/i,
    category: 'Parse Error',
    recommendation: {
      action: 'Check input data format and schema validation',
      priority: 'medium',
      commands: ['Review recent job payloads', 'Check schema definitions'],
    },
  },
  {
    regex: /out.?of.?memory|heap|OOM/i,
    category: 'Memory Error',
    recommendation: {
      action: 'Increase memory limits or optimize memory usage',
      priority: 'high',
      commands: ['Check container memory limits', 'Review memory profiling'],
    },
  },
  {
    regex: /not.?found|404|missing|does.?not.?exist/i,
    category: 'Resource Not Found',
    recommendation: {
      action: 'Verify resource exists and paths are correct',
      priority: 'medium',
      commands: ['Check resource URLs', 'Verify file paths'],
    },
  },
  {
    regex: /circuit.?breaker|circuit.?open/i,
    category: 'Circuit Breaker Open',
    recommendation: {
      action: 'Wait for circuit to reset or investigate underlying failures',
      priority: 'high',
      commands: ['Check circuit breaker status', 'Review failure logs'],
    },
  },
];

/**
 * Analyze DLQ entries and provide triage guidance
 */
export function analyzeTriageAssist(entries: DLQEntry[]): TriageAssistResult {
  if (entries.length === 0) {
    return {
      level: 'info',
      summary: 'DLQ is empty. No action required.',
      patterns: [],
      recommendations: [],
      markdown: formatTriageAssistMarkdown({
        level: 'info',
        summary: 'DLQ is empty. No action required.',
        patterns: [],
        recommendations: [],
        markdown: '',
      }),
    };
  }

  // Analyze patterns
  const patternCounts = new Map<string, { count: number; examples: string[] }>();

  for (const entry of entries) {
    const reason = redact(entry.reason);

    for (const pattern of FAILURE_PATTERNS) {
      if (pattern.regex.test(reason)) {
        const existing = patternCounts.get(pattern.category) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(reason.slice(0, 100));
        }
        patternCounts.set(pattern.category, existing);
      }
    }
  }

  // Build failure patterns with recommendations
  const patterns: FailurePattern[] = [];
  const recommendations: TriageRecommendation[] = [];

  for (const [category, data] of patternCounts) {
    const patternDef = FAILURE_PATTERNS.find((p) => p.category === category);
    if (patternDef) {
      const recommendation: TriageRecommendation = {
        ...patternDef.recommendation,
        reason: `${data.count} entries with ${category} errors`,
      };

      patterns.push({
        pattern: category,
        count: data.count,
        examples: data.examples,
        recommendation,
      });

      recommendations.push(recommendation);
    }
  }

  // Sort by count descending
  patterns.sort((a, b) => b.count - a.count);
  recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Determine level
  let level: TriageLevel = 'info';
  if (entries.length >= 20 || recommendations.some((r) => r.priority === 'high')) {
    level = 'critical';
  } else if (entries.length >= 5 || recommendations.some((r) => r.priority === 'medium')) {
    level = 'warn';
  }

  // Build summary
  const topPatterns = patterns.slice(0, 3).map((p) => p.pattern);
  const summary = entries.length === 1
    ? `1 entry in DLQ. Pattern: ${topPatterns.join(', ') || 'Unknown'}`
    : `${entries.length} entries in DLQ. Top patterns: ${topPatterns.join(', ') || 'Unknown'}`;

  const result: TriageAssistResult = {
    level,
    summary,
    patterns,
    recommendations,
    markdown: '',
  };

  result.markdown = formatTriageAssistMarkdown(result);

  return result;
}

/**
 * Format triage assist result as Markdown for Issue posting
 */
export function formatTriageAssistMarkdown(result: TriageAssistResult): string {
  const lines: string[] = [];

  // Header with level badge
  const levelBadge =
    result.level === 'critical'
      ? '![CRITICAL](https://img.shields.io/badge/DLQ-CRITICAL-red)'
      : result.level === 'warn'
        ? '![WARN](https://img.shields.io/badge/DLQ-WARN-yellow)'
        : '![INFO](https://img.shields.io/badge/DLQ-INFO-blue)';

  lines.push(`### DLQ Triage Assist ${levelBadge}`);
  lines.push('');
  lines.push(`**Summary:** ${result.summary}`);
  lines.push('');

  if (result.patterns.length > 0) {
    lines.push('#### Detected Patterns');
    lines.push('');
    lines.push('| Pattern | Count | Priority |');
    lines.push('|---------|-------|----------|');
    for (const pattern of result.patterns.slice(0, 5)) {
      lines.push(`| ${pattern.pattern} | ${pattern.count} | ${pattern.recommendation.priority} |`);
    }
    lines.push('');
  }

  if (result.recommendations.length > 0) {
    lines.push('#### Recommended Actions');
    lines.push('');
    for (const rec of result.recommendations.slice(0, 5)) {
      lines.push(`- **${rec.priority.toUpperCase()}**: ${rec.action}`);
      if (rec.commands && rec.commands.length > 0) {
        lines.push(`  - Commands: \`${rec.commands.join('`, `')}\``);
      }
    }
    lines.push('');
  }

  if (result.patterns.length === 0 && result.recommendations.length === 0) {
    lines.push('No specific patterns detected. Review individual DLQ entries for details.');
    lines.push('');
    lines.push('```bash');
    lines.push('npm run jobs:dlq:triage');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get triage guidance for a single failure reason
 */
export function getTriageGuidance(reason: string): TriageRecommendation | null {
  const redactedReason = redact(reason);

  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.regex.test(redactedReason)) {
      return {
        ...pattern.recommendation,
        reason: `Matched pattern: ${pattern.category}`,
      };
    }
  }

  return null;
}
