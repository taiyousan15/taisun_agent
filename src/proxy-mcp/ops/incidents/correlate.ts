/**
 * Incident Correlation - P17
 *
 * Generates correlation keys for incident deduplication
 */

import { createHash } from 'crypto';
import type {
  CorrelationConfig,
  CorrelationInput,
  IncidentSeverity,
} from './types';

/**
 * Default correlation config
 */
const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  includeSeverity: true,
  includeReasons: true,
  includeComponents: true,
  maxReasonsForKey: 3,
};

/**
 * Normalize a string for correlation (lowercase, trim, remove special chars)
 */
function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Sort and deduplicate an array of strings
 */
function sortAndDedupe(arr: string[]): string[] {
  return [...new Set(arr.map(normalizeString))].sort();
}

/**
 * Generate a correlation key from input data
 *
 * The key is a hash of: severity + topReasons + affectedComponents
 * This allows grouping similar incidents together
 */
export function generateCorrelationKey(
  input: CorrelationInput,
  config: Partial<CorrelationConfig> = {}
): string {
  const cfg: CorrelationConfig = { ...DEFAULT_CORRELATION_CONFIG, ...config };

  const parts: string[] = [];

  // Include severity if configured
  if (cfg.includeSeverity) {
    parts.push(`severity:${input.severity}`);
  }

  // Include top reasons if configured
  if (cfg.includeReasons && input.reasons.length > 0) {
    const normalizedReasons = sortAndDedupe(input.reasons);
    const topReasons = normalizedReasons.slice(0, cfg.maxReasonsForKey);
    parts.push(`reasons:${topReasons.join(',')}`);
  }

  // Include components if configured
  if (cfg.includeComponents && input.components.length > 0) {
    const normalizedComponents = sortAndDedupe(input.components);
    parts.push(`components:${normalizedComponents.join(',')}`);
  }

  // If no parts, use a fallback
  if (parts.length === 0) {
    parts.push('unknown');
  }

  // Generate hash
  const keyString = parts.join('|');
  const hash = createHash('sha256').update(keyString).digest('hex');

  // Return first 16 chars for readability
  return hash.substring(0, 16);
}

/**
 * Extract reasons from various input formats
 */
export function extractReasons(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.filter((r): r is string => typeof r === 'string');
  }

  if (typeof input === 'string') {
    // Split by common delimiters
    return input.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    // Try common field names
    for (const field of ['reasons', 'errors', 'causes', 'messages']) {
      if (obj[field]) {
        return extractReasons(obj[field]);
      }
    }
  }

  return [];
}

/**
 * Extract components from various input formats
 */
export function extractComponents(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.filter((c): c is string => typeof c === 'string');
  }

  if (typeof input === 'string') {
    return input.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    for (const field of ['components', 'services', 'sources', 'targets']) {
      if (obj[field]) {
        return extractComponents(obj[field]);
      }
    }
  }

  return [];
}

/**
 * Determine severity from various inputs
 */
export function determineSeverity(input: unknown): IncidentSeverity {
  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    if (lower.includes('critical') || lower.includes('error') || lower.includes('fatal')) {
      return 'critical';
    }
    if (lower.includes('warn')) {
      return 'warn';
    }
    if (lower.includes('ok') || lower.includes('resolved') || lower.includes('success')) {
      return 'ok';
    }
    return 'info';
  }

  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    for (const field of ['severity', 'level', 'status', 'priority']) {
      if (obj[field]) {
        return determineSeverity(obj[field]);
      }
    }
  }

  return 'info';
}

/**
 * Build correlation input from raw data
 */
export function buildCorrelationInput(data: {
  severity?: IncidentSeverity | string;
  reasons?: unknown;
  components?: unknown;
  signals?: string[];
}): CorrelationInput {
  return {
    severity: typeof data.severity === 'string'
      ? determineSeverity(data.severity)
      : (data.severity || 'info'),
    reasons: extractReasons(data.reasons),
    components: extractComponents(data.components),
    signals: data.signals,
  };
}

/**
 * Check if two correlation keys match
 */
export function keysMatch(key1: string, key2: string): boolean {
  return key1 === key2;
}

/**
 * Generate a human-readable correlation summary
 */
export function correlationSummary(input: CorrelationInput): string {
  const parts: string[] = [];

  parts.push(`[${input.severity.toUpperCase()}]`);

  if (input.reasons.length > 0) {
    const topReasons = input.reasons.slice(0, 3);
    parts.push(`Reasons: ${topReasons.join(', ')}`);
  }

  if (input.components.length > 0) {
    parts.push(`Components: ${input.components.join(', ')}`);
  }

  return parts.join(' | ');
}
