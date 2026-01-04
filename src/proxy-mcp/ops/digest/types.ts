/**
 * Weekly Digest Types - P17
 */

/**
 * Configuration for weekly digest
 */
export interface DigestConfig {
  enabled: boolean;
  createIssue: boolean;
  dayOfWeek: number; // 0=Sunday, 1=Monday, etc.
  topCauses: number;
  lookbackDays: number;
}

/**
 * Default digest configuration
 */
export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  enabled: false, // Disabled by default for safety
  createIssue: false,
  dayOfWeek: 1, // Monday
  topCauses: 3,
  lookbackDays: 7,
};

/**
 * Top cause in digest
 */
export interface TopCause {
  reason: string;
  count: number;
  percentage: number;
  affectedComponents: string[];
  severityBreakdown: {
    critical: number;
    warn: number;
    info: number;
  };
}

/**
 * Recommended improvement action
 */
export interface RecommendedAction {
  priority: 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  relatedCauses: string[];
  estimatedImpact: string;
}

/**
 * Weekly digest data
 */
export interface WeeklyDigest {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;

  // Summary metrics
  summary: {
    totalIncidents: number;
    criticalCount: number;
    warnCount: number;
    infoCount: number;
    resolvedCount: number;
    activeCount: number;
    avgResolutionTimeMinutes: number | null;
  };

  // Top causes
  topCauses: TopCause[];

  // Recommended actions
  recommendedActions: RecommendedAction[];

  // Component health
  componentHealth: Array<{
    component: string;
    incidentCount: number;
    healthScore: number; // 0-100
  }>;
}

/**
 * Result of digest generation
 */
export interface DigestGenerationResult {
  success: boolean;
  digest?: WeeklyDigest;
  markdown?: string;
  issueCreated?: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}
