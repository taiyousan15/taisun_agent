/**
 * MCP Catalog Scoring - P9
 *
 * Scoring system for MCP candidates:
 * - Priority areas (browser/web-analysis/rag-db) get bonuses
 * - Destructive/high-privilege operations get penalties
 * - Duplicate detection for similar tools
 * - Manual overrides from overrides.json
 */

import {
  CatalogEntry,
  MCPCategory,
  RiskLevel,
  ScoringConfig,
  OverridesConfig,
  ScoreOverride,
} from './types';

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  baseScore: 50,
  categoryScores: {
    browser: 20, // Priority: browser automation
    'web-api': 15, // Priority: web analysis
    database: 10, // Priority: RAG/DB operations
    filesystem: 5,
    development: 5,
    'ai-ml': 5,
    monitoring: 0,
    messaging: 0,
    cloud: -5, // Requires credentials
    security: -10, // Sensitive operations
    dangerous: -50, // Dangerous operations
    other: 0,
  },
  riskPatterns: [
    { pattern: 'root|admin|sudo|privilege', riskLevel: 'critical', scorePenalty: -100 },
    { pattern: 'shell|exec|execute|command', riskLevel: 'high', scorePenalty: -50 },
    { pattern: 'delete|remove|destroy|drop', riskLevel: 'high', scorePenalty: -30 },
    { pattern: 'credential|secret|password|token|key', riskLevel: 'high', scorePenalty: -20 },
    { pattern: 'write|modify|update', riskLevel: 'medium', scorePenalty: -10 },
  ],
  priorityKeywords: [
    { pattern: 'puppeteer|playwright|browser|chrome', bonus: 15 },
    { pattern: 'fetch|http|api|web', bonus: 10 },
    { pattern: 'postgres|mysql|database|query', bonus: 10 },
    { pattern: 'github|git|development', bonus: 5 },
  ],
};

/**
 * Apply scoring configuration to a catalog entry
 */
export function scoreEntry(
  entry: CatalogEntry,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): CatalogEntry {
  let score = entry.baseScore;

  // Apply category score
  const categoryScore = config.categoryScores[entry.category] || 0;
  score += categoryScore;

  // Apply risk penalties
  const text = `${entry.name} ${entry.description}`.toLowerCase();
  for (const { pattern, scorePenalty } of config.riskPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(text)) {
      score += scorePenalty;
    }
  }

  // Apply priority bonuses
  for (const { pattern, bonus } of config.priorityKeywords) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(text)) {
      score += bonus;
    }
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    ...entry,
    finalScore: score,
  };
}

/**
 * Apply overrides to a catalog entry
 */
export function applyOverride(
  entry: CatalogEntry,
  override: ScoreOverride
): CatalogEntry {
  let finalScore = entry.finalScore + override.scoreAdjustment;
  finalScore = Math.max(0, Math.min(100, finalScore));

  return {
    ...entry,
    finalScore,
    requireHuman: override.requireHuman ?? entry.requireHuman,
    blocked: override.blocked ?? entry.blocked,
  };
}

/**
 * Apply all overrides to catalog entries
 */
export function applyOverrides(
  entries: CatalogEntry[],
  overrides: OverridesConfig
): CatalogEntry[] {
  return entries.map((entry) => {
    const override = overrides.overrides[entry.id];
    if (override) {
      return applyOverride(entry, override);
    }
    return entry;
  });
}

/**
 * Score all catalog entries
 */
export function scoreCatalog(
  entries: CatalogEntry[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  overrides?: OverridesConfig
): CatalogEntry[] {
  // Apply base scoring
  let scored = entries.map((entry) => scoreEntry(entry, config));

  // Apply overrides if provided
  if (overrides) {
    scored = applyOverrides(scored, overrides);
  }

  return scored;
}

/**
 * Detect duplicate/similar entries
 *
 * Returns entries grouped by similarity (same category + similar name)
 */
export function detectDuplicates(
  entries: CatalogEntry[]
): Map<string, CatalogEntry[]> {
  const groups = new Map<string, CatalogEntry[]>();

  for (const entry of entries) {
    // Create group key from category + normalized name prefix
    const namePrefix = entry.name
      .toLowerCase()
      .replace(/-mcp$/, '')
      .replace(/[^a-z]+/g, '');
    const groupKey = `${entry.category}:${namePrefix}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(entry);
  }

  // Filter to groups with more than 1 entry
  const duplicates = new Map<string, CatalogEntry[]>();
  for (const [key, group] of groups) {
    if (group.length > 1) {
      duplicates.set(key, group);
    }
  }

  return duplicates;
}

/**
 * Apply duplicate penalty to entries
 *
 * When multiple similar tools exist, lower-scored ones get additional penalty
 */
export function applyDuplicatePenalty(
  entries: CatalogEntry[],
  penaltyPerDuplicate: number = 5
): CatalogEntry[] {
  const duplicates = detectDuplicates(entries);

  return entries.map((entry) => {
    // Find which group this entry belongs to
    for (const [, group] of duplicates) {
      if (group.some((e) => e.id === entry.id)) {
        // Sort group by score descending
        const sorted = [...group].sort((a, b) => b.finalScore - a.finalScore);
        const position = sorted.findIndex((e) => e.id === entry.id);

        // First entry (highest score) gets no penalty
        // Others get increasing penalty
        const penalty = position * penaltyPerDuplicate;
        const newScore = Math.max(0, entry.finalScore - penalty);

        return {
          ...entry,
          finalScore: newScore,
        };
      }
    }

    return entry;
  });
}

/**
 * Get top N candidates by score
 */
export function getTopCandidates(
  entries: CatalogEntry[],
  limit: number = 20,
  excludeBlocked: boolean = true
): CatalogEntry[] {
  let filtered = entries;

  if (excludeBlocked) {
    filtered = entries.filter((e) => !e.blocked);
  }

  return filtered
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}

/**
 * Get candidates by category
 */
export function getCandidatesByCategory(
  entries: CatalogEntry[],
  category: MCPCategory
): CatalogEntry[] {
  return entries
    .filter((e) => e.category === category)
    .sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Get candidates by risk level
 */
export function getCandidatesByRisk(
  entries: CatalogEntry[],
  riskLevel: RiskLevel
): CatalogEntry[] {
  return entries
    .filter((e) => e.riskLevel === riskLevel)
    .sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Get scoring summary
 */
export function getScoringStats(entries: CatalogEntry[]): {
  total: number;
  byCategory: Record<MCPCategory, number>;
  byRiskLevel: Record<RiskLevel, number>;
  blocked: number;
  requireHuman: number;
  avgScore: number;
} {
  const byCategory: Record<MCPCategory, number> = {
    browser: 0,
    filesystem: 0,
    database: 0,
    'web-api': 0,
    development: 0,
    cloud: 0,
    'ai-ml': 0,
    security: 0,
    monitoring: 0,
    messaging: 0,
    dangerous: 0,
    other: 0,
  };

  const byRiskLevel: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let blocked = 0;
  let requireHuman = 0;
  let totalScore = 0;

  for (const entry of entries) {
    byCategory[entry.category]++;
    byRiskLevel[entry.riskLevel]++;
    if (entry.blocked) blocked++;
    if (entry.requireHuman) requireHuman++;
    totalScore += entry.finalScore;
  }

  return {
    total: entries.length,
    byCategory,
    byRiskLevel,
    blocked,
    requireHuman,
    avgScore: entries.length > 0 ? totalScore / entries.length : 0,
  };
}
