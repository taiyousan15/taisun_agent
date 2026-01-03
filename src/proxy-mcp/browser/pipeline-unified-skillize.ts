/**
 * Unified Pipeline: web_skillize - P8
 *
 * Single entrypoint for web skillize with explicit mode selection:
 * - mode='tabs': Collect URLs from Chrome tabs via CDP
 * - mode='refId': Use existing URL bundle from memory
 *
 * Features:
 * - Explicit mode parameter for clear API
 * - Minimal output: summary + refId only
 * - Dry-run default: confirmWrite=false
 * - Delegates to runPipelineTabsSkillize internally
 *
 * Output: pipeline-run record containing all intermediate refIds
 */

import { MemoryNamespace } from '../memory/types';
import { recordEvent } from '../observability';
import {
  runPipelineTabsSkillize,
  PipelineTabsSkillizeConfig,
  PipelineResult,
} from './pipeline-tabs-skillize';

/** Input mode for unified pipeline */
export type PipelineMode = 'tabs' | 'refId';

/** Unified pipeline configuration */
export interface UnifiedPipelineConfig {
  /** Input mode: 'tabs' (CDP) or 'refId' (existing bundle) */
  mode: PipelineMode;
  /** Required when mode='refId': Memory refId for URL bundle */
  inputRefId?: string;
  /** Include only these domains */
  includeDomains?: string[] | null;
  /** Exclude these domains */
  excludeDomains?: string[] | null;
  /** Exclude URLs matching these patterns */
  excludeUrlPatterns?: string[] | null;
  /** Maximum URLs to process (default: 200) */
  maxUrls?: number;
  /** Per-domain limit (default: 50) */
  perDomainLimit?: number;
  /** Remove tracking parameters (default: true) */
  stripTracking?: boolean;
  /** Maximum URLs to fetch/skillize (default: 20) */
  maxFetch?: number;
  /** Concurrency for skillize (default: 3) */
  concurrency?: number;
  /** Rate limit between URLs in ms (default: 1000) */
  rateLimitMs?: number;
  /** Confirm write to disk (default: false = dry-run) */
  confirmWrite?: boolean;
  /** Memory namespace (default: 'long-term') */
  namespace?: MemoryNamespace;
}

/** Default configuration for unified pipeline */
export const DEFAULT_UNIFIED_CONFIG: Required<
  Omit<UnifiedPipelineConfig, 'mode' | 'inputRefId' | 'includeDomains' | 'excludeDomains' | 'excludeUrlPatterns'>
> & {
  includeDomains: string[] | null;
  excludeDomains: string[] | null;
  excludeUrlPatterns: string[] | null;
} = {
  includeDomains: null,
  excludeDomains: null,
  excludeUrlPatterns: null,
  maxUrls: 200,
  perDomainLimit: 50,
  stripTracking: true,
  maxFetch: 20,
  concurrency: 3,
  rateLimitMs: 1000,
  confirmWrite: false,
  namespace: 'long-term',
};

/** Result type with mode info */
export interface UnifiedPipelineResult extends PipelineResult {
  mode?: PipelineMode;
}

/**
 * Validate unified pipeline configuration
 *
 * @param config Configuration to validate
 * @returns Error message if invalid, null if valid
 */
export function validateUnifiedConfig(
  config: Partial<UnifiedPipelineConfig>
): string | null {
  if (!config.mode) {
    return 'mode is required: "tabs" (CDP) or "refId" (existing bundle)';
  }

  if (config.mode !== 'tabs' && config.mode !== 'refId') {
    return `Invalid mode "${config.mode}". Use "tabs" or "refId"`;
  }

  if (config.mode === 'refId' && !config.inputRefId) {
    return 'inputRefId is required when mode="refId"';
  }

  if (config.mode === 'tabs' && config.inputRefId) {
    return 'inputRefId should not be provided when mode="tabs". Use mode="refId" instead.';
  }

  return null;
}

/**
 * Run unified web skillize pipeline
 *
 * Single entrypoint with explicit mode selection:
 * - mode='tabs': Collect URLs from Chrome tabs via CDP
 * - mode='refId': Use existing URL bundle from memory
 *
 * @param config Unified pipeline configuration (mode is required)
 * @returns Pipeline result with summary + refId
 *
 * @example
 * // Mode: tabs - collect from Chrome tabs
 * const result = await runUnifiedPipeline({
 *   mode: 'tabs',
 *   includeDomains: ['docs.example.com'],
 * });
 *
 * @example
 * // Mode: refId - use existing URL bundle
 * const result = await runUnifiedPipeline({
 *   mode: 'refId',
 *   inputRefId: 'existing-bundle-ref-123',
 * });
 */
export async function runUnifiedPipeline(
  config: Partial<UnifiedPipelineConfig> & { mode: PipelineMode }
): Promise<UnifiedPipelineResult> {
  const startTime = Date.now();

  // Validate configuration
  const validationError = validateUnifiedConfig(config);
  if (validationError) {
    recordEvent('pipeline_unified_skillize', 'pipeline', 'fail', {
      metadata: {
        error: validationError,
        mode: config.mode,
      },
    });

    return {
      success: false,
      error: validationError,
      mode: config.mode,
    };
  }

  // Convert to internal config
  const internalConfig: Partial<PipelineTabsSkillizeConfig> = {
    inputRefId: config.mode === 'refId' ? config.inputRefId : null,
    includeDomains: config.includeDomains ?? null,
    excludeDomains: config.excludeDomains ?? null,
    excludeUrlPatterns: config.excludeUrlPatterns ?? null,
    maxUrls: config.maxUrls,
    perDomainLimit: config.perDomainLimit,
    stripTracking: config.stripTracking,
    maxFetch: config.maxFetch,
    concurrency: config.concurrency,
    rateLimitMs: config.rateLimitMs,
    confirmWrite: config.confirmWrite,
    namespace: config.namespace,
  };

  // Run the underlying pipeline
  const result = await runPipelineTabsSkillize(internalConfig);

  // Record observability event
  const durationMs = Date.now() - startTime;
  recordEvent('pipeline_unified_skillize', 'pipeline', result.success ? 'ok' : 'fail', {
    metadata: {
      mode: config.mode,
      durationMs,
      success: result.success,
    },
  });

  // Enhance summary with mode info
  let enhancedSummary = result.summary;
  if (result.summary) {
    enhancedSummary = result.summary.replace(
      'Pipeline: web_skillize_from_tabs',
      `Pipeline: web_skillize (mode=${config.mode})`
    );
  }

  return {
    ...result,
    summary: enhancedSummary,
    mode: config.mode,
  };
}

/**
 * Get mode from inputRefId for backwards compatibility
 *
 * @param inputRefId Optional inputRefId
 * @returns Inferred mode
 */
export function inferModeFromConfig(inputRefId?: string | null): PipelineMode {
  return inputRefId ? 'refId' : 'tabs';
}
