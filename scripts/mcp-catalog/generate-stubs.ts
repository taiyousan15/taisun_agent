#!/usr/bin/env npx ts-node
/**
 * MCP Catalog Stub Generator CLI - P9
 *
 * Generates disabled stubs for internal-mcps.local.example.generated.json
 *
 * Usage:
 *   npx ts-node scripts/mcp-catalog/generate-stubs.ts [--top N]
 *
 * Options:
 *   --top N    Generate only top N candidates by score (default: all)
 *
 * Reads:  catalog/mcp/catalog.json
 * Writes: config/proxy-mcp/internal-mcps.local.example.generated.json
 *
 * IMPORTANT:
 * - All generated stubs are DISABLED (enabled: false)
 * - No real credentials are included (only placeholders)
 * - Production enablement requires Phase 6 rollout
 *
 * @istanbul ignore file
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateTopStubs,
  generateStubsFile,
  generateInternalMcpsExample,
} from '../../src/proxy-mcp/catalog/generate-internal-stubs';
import { Catalog } from '../../src/proxy-mcp/catalog/types';

const CATALOG_PATH = path.join(process.cwd(), 'catalog/mcp/catalog.json');
const OUTPUT_PATH = path.join(process.cwd(), 'config/proxy-mcp/internal-mcps.local.example.generated.json');

function parseArgs(): { top?: number } {
  const args = process.argv.slice(2);
  const topIndex = args.indexOf('--top');
  if (topIndex !== -1 && args[topIndex + 1]) {
    return { top: parseInt(args[topIndex + 1], 10) };
  }
  return {};
}

async function main(): Promise<void> {
  const { top } = parseArgs();

  console.log(`[stubs] Reading catalog: ${CATALOG_PATH}`);

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`[stubs] ✗ Catalog not found: ${CATALOG_PATH}`);
    console.error(`[stubs]   Run 'npm run catalog:import' and 'npm run catalog:score' first`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as Catalog;
  console.log(`[stubs] Found ${catalog.entries.length} entries`);

  // Generate stubs
  let stubsFile;
  if (top) {
    console.log(`[stubs] Generating top ${top} candidates...`);
    stubsFile = generateTopStubs(catalog, top);
  } else {
    console.log(`[stubs] Generating all non-blocked entries...`);
    stubsFile = generateStubsFile(catalog);
  }

  console.log(`[stubs] Generated ${stubsFile.stubs.length} stubs`);

  // Convert to internal-mcps format
  const mcpsExample = generateInternalMcpsExample(stubsFile.stubs);

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mcpsExample, null, 2));

  console.log(`[stubs] ✓ Wrote ${OUTPUT_PATH}`);
  console.log(`[stubs]`);
  console.log(`[stubs] IMPORTANT:`);
  console.log(`[stubs]   - All stubs are DISABLED (enabled: false)`);
  console.log(`[stubs]   - No real credentials included`);
  console.log(`[stubs]   - To enable, follow Phase 6 rollout process`);
  console.log(`[stubs]`);

  // Show summary
  const byRisk = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const stub of stubsFile.stubs) {
    byRisk.set(stub.riskLevel, (byRisk.get(stub.riskLevel) || 0) + 1);
  }

  console.log(`[stubs] By risk level:`);
  for (const [level, count] of Array.from(byRisk.entries()).sort()) {
    console.log(`[stubs]   ${level}: ${count}`);
  }

  // Show first few stubs
  console.log(`\n[stubs] Generated stubs (first 5):`);
  for (const stub of stubsFile.stubs.slice(0, 5)) {
    console.log(`[stubs]   - ${stub.name} [${stub.riskLevel}]`);
  }
  if (stubsFile.stubs.length > 5) {
    console.log(`[stubs]   ... and ${stubsFile.stubs.length - 5} more`);
  }
}

main().catch((err) => {
  console.error('[stubs] ✗ Error:', err.message);
  process.exit(1);
});
