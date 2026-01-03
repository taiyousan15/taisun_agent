/**
 * MCP Catalog Module - P9
 *
 * Entry point for catalog management:
 * - Import from external sources (awesome lists)
 * - Score candidates
 * - Generate disabled stubs
 *
 * IMPORTANT: Catalog is for candidates only.
 * Production enablement requires Phase 6 rollout.
 */

export * from './types';
export * from './importers/markdown';
export * from './score';
export * from './generate-internal-stubs';
