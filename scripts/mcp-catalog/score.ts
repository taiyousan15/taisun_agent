#!/usr/bin/env npx ts-node
/**
 * MCP Catalog Score CLI - P9
 *
 * Scores catalog entries and applies overrides
 *
 * Usage:
 *   npx ts-node scripts/mcp-catalog/score.ts
 *
 * Reads:  catalog/mcp/catalog.json, catalog/mcp/overrides.json
 * Writes: catalog/mcp/catalog.json (updated with scores)
 *
 * @istanbul ignore file
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  scoreCatalog,
  getScoringStats,
  DEFAULT_SCORING_CONFIG,
} from '../../src/proxy-mcp/catalog/score';
import { Catalog, OverridesConfig } from '../../src/proxy-mcp/catalog/types';

const CATALOG_DIR = path.join(process.cwd(), 'catalog/mcp');
const CATALOG_PATH = path.join(CATALOG_DIR, 'catalog.json');
const OVERRIDES_PATH = path.join(CATALOG_DIR, 'overrides.json');

async function main(): Promise<void> {
  console.log(`[score] Reading catalog: ${CATALOG_PATH}`);

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`[score] ✗ Catalog not found: ${CATALOG_PATH}`);
    console.error(`[score]   Run 'npm run catalog:import' first`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as Catalog;
  console.log(`[score] Found ${catalog.entries.length} entries`);

  // Load overrides if exists
  let overrides: OverridesConfig | undefined;
  if (fs.existsSync(OVERRIDES_PATH)) {
    console.log(`[score] Loading overrides: ${OVERRIDES_PATH}`);
    overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')) as OverridesConfig;
    console.log(`[score] Overrides for ${Object.keys(overrides.overrides).length} entries`);
  }

  // Score entries
  console.log(`[score] Scoring entries...`);
  const scoredEntries = scoreCatalog(catalog.entries, DEFAULT_SCORING_CONFIG, overrides);

  // Update catalog
  const updatedCatalog: Catalog = {
    ...catalog,
    generatedAt: new Date().toISOString(),
    entries: scoredEntries,
  };

  // Write updated catalog
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(updatedCatalog, null, 2));
  console.log(`[score] ✓ Updated catalog with scores`);

  // Show statistics
  const stats = getScoringStats(scoredEntries);
  console.log(`\n[score] Statistics:`);
  console.log(`[score]   Total entries: ${stats.total}`);
  console.log(`[score]   Average score: ${stats.avgScore.toFixed(1)}`);
  console.log(`[score]   Blocked: ${stats.blocked}`);
  console.log(`[score]   Require human: ${stats.requireHuman}`);

  console.log(`\n[score] By category:`);
  for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`[score]   ${cat}: ${count}`);
  }

  console.log(`\n[score] By risk level:`);
  for (const [level, count] of Object.entries(stats.byRiskLevel).sort()) {
    console.log(`[score]   ${level}: ${count}`);
  }

  // Show top 10 candidates
  const top10 = scoredEntries
    .filter((e) => !e.blocked)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 10);

  console.log(`\n[score] Top 10 candidates:`);
  for (const entry of top10) {
    const flags = [
      entry.requireHuman ? 'H' : '',
      entry.riskLevel === 'high' ? 'R' : '',
    ].filter(Boolean).join('');
    console.log(`[score]   ${entry.finalScore.toString().padStart(3)} ${entry.id} [${entry.category}] ${flags}`);
  }
}

main().catch((err) => {
  console.error('[score] ✗ Error:', err.message);
  process.exit(1);
});
