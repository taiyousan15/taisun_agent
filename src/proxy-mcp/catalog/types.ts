/**
 * MCP Catalog Types - P9
 *
 * Types for MCP catalog management:
 * - Source definitions (where candidates come from)
 * - Catalog entries (candidate MCPs)
 * - Scoring configuration
 * - Override definitions
 */

/**
 * Source type for catalog imports
 */
export type SourceType = 'markdown' | 'json' | 'yaml';

/**
 * External source definition
 */
export interface CatalogSource {
  /** Unique identifier for the source */
  id: string;
  /** Human-readable name */
  name: string;
  /** URL to fetch the source from */
  url: string;
  /** Content type */
  type: SourceType;
  /** Description of the source */
  description?: string;
  /** Last import timestamp */
  lastImported: string | null;
  /** Whether this source is enabled for import */
  enabled: boolean;
}

/**
 * Sources configuration file
 */
export interface SourcesConfig {
  $schema?: string;
  sources: CatalogSource[];
}

/**
 * Category for MCP entries
 */
export type MCPCategory =
  | 'browser'
  | 'filesystem'
  | 'database'
  | 'web-api'
  | 'development'
  | 'cloud'
  | 'ai-ml'
  | 'security'
  | 'monitoring'
  | 'messaging'
  | 'dangerous'
  | 'other';

/**
 * Risk level for MCP entries
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Catalog entry representing an MCP candidate
 */
export interface CatalogEntry {
  /** Unique identifier (derived from name) */
  id: string;
  /** MCP name */
  name: string;
  /** Description */
  description: string;
  /** Source URL (GitHub, npm, etc.) */
  url: string;
  /** Category */
  category: MCPCategory;
  /** Source that discovered this entry */
  sourceId: string;
  /** When this entry was first added */
  addedAt: string;
  /** Computed risk level */
  riskLevel: RiskLevel;
  /** Tags for filtering */
  tags: string[];
  /** Base score (before overrides) */
  baseScore: number;
  /** Final score (after overrides) */
  finalScore: number;
  /** Whether human approval is required for enablement */
  requireHuman: boolean;
  /** Whether this entry is blocked from enablement */
  blocked: boolean;
}

/**
 * Catalog file structure
 */
export interface Catalog {
  $schema?: string;
  /** Catalog version */
  version: string;
  /** When the catalog was last generated */
  generatedAt: string | null;
  /** Sources used to generate this catalog */
  sources: string[];
  /** Catalog entries */
  entries: CatalogEntry[];
}

/**
 * Override configuration for a specific MCP
 */
export interface ScoreOverride {
  /** Score adjustment (+/-) */
  scoreAdjustment: number;
  /** Reason for the override */
  reason: string;
  /** Force human approval requirement */
  requireHuman?: boolean;
  /** Block this MCP from enablement */
  blocked?: boolean;
}

/**
 * Overrides configuration file
 */
export interface OverridesConfig {
  $schema?: string;
  description?: string;
  overrides: Record<string, ScoreOverride>;
}

/**
 * Scoring configuration
 */
export interface ScoringConfig {
  /** Base score for all entries */
  baseScore: number;
  /** Category bonuses/penalties */
  categoryScores: Record<MCPCategory, number>;
  /** Keyword patterns for risk detection */
  riskPatterns: {
    pattern: string;
    riskLevel: RiskLevel;
    scorePenalty: number;
  }[];
  /** Priority keywords (bonus) */
  priorityKeywords: {
    pattern: string;
    bonus: number;
  }[];
}

/**
 * Parsed markdown link
 */
export interface ParsedLink {
  /** Link text (name) */
  name: string;
  /** Link URL */
  url: string;
  /** Description after the link */
  description: string;
}

/**
 * Parsed markdown section
 */
export interface ParsedSection {
  /** Section heading */
  heading: string;
  /** Heading level (1-6) */
  level: number;
  /** Links in this section */
  links: ParsedLink[];
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  sourceId: string;
  entriesAdded: number;
  entriesUpdated: number;
  entriesTotal: number;
  errors: string[];
}

/**
 * Generated stub for internal-mcps config
 */
export interface GeneratedStub {
  /** MCP name */
  name: string;
  /** Display name */
  displayName: string;
  /** Description */
  description: string;
  /** Command to run */
  command: string;
  /** Command arguments */
  args: string[];
  /** Required environment variables (placeholders) */
  requiredEnv: string[];
  /** Whether this stub is enabled (always false for generated) */
  enabled: false;
  /** Timeout in ms */
  timeout: number;
  /** Retry configuration */
  retry: {
    maxAttempts: number;
    delayMs: number;
  };
  /** Source catalog entry ID */
  catalogEntryId: string;
  /** Risk level from catalog */
  riskLevel: RiskLevel;
  /** Whether human approval is required */
  requireHuman: boolean;
}

/**
 * Generated stubs file
 */
export interface GeneratedStubsFile {
  $schema?: string;
  generatedAt: string;
  catalogVersion: string;
  description: string;
  stubs: GeneratedStub[];
}
