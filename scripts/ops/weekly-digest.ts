#!/usr/bin/env npx tsx
/* istanbul ignore file */
/**
 * Weekly Digest CLI - P17
 *
 * Generate weekly improvement digest from incident data
 *
 * Usage:
 *   npx tsx scripts/ops/weekly-digest.ts [options]
 *
 * Options:
 *   --lookback-days <n>  Days to look back (default: 7)
 *   --top-causes <n>     Number of top causes to include (default: 3)
 *   --output <file>      Write markdown to file
 *   --json               Output as JSON instead of markdown
 *   --help               Show this help message
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  generateWeeklyDigest,
  digestToMarkdown,
  DEFAULT_DIGEST_CONFIG,
} from '../../src/proxy-mcp/ops/digest';
import { JsonlIncidentStateStore } from '../../src/proxy-mcp/ops/incidents/state-store';
import type { StateStoreConfig } from '../../src/proxy-mcp/ops/incidents/types';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let lookbackDays = DEFAULT_DIGEST_CONFIG.lookbackDays;
  let topCauses = DEFAULT_DIGEST_CONFIG.topCauses;
  let outputFile: string | null = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        console.log(`
Weekly Digest CLI - P17

Generate weekly improvement digest from incident data

Usage:
  npx tsx scripts/ops/weekly-digest.ts [options]

Options:
  --lookback-days <n>  Days to look back (default: 7)
  --top-causes <n>     Number of top causes to include (default: 3)
  --output <file>      Write markdown to file
  --json               Output as JSON instead of markdown
  --help               Show this help message

Examples:
  npx tsx scripts/ops/weekly-digest.ts
  npx tsx scripts/ops/weekly-digest.ts --lookback-days 14 --top-causes 5
  npx tsx scripts/ops/weekly-digest.ts --output digest.md
  npx tsx scripts/ops/weekly-digest.ts --json > digest.json
`);
        process.exit(0);
        break;
      case '--lookback-days':
        lookbackDays = parseInt(args[++i], 10);
        break;
      case '--top-causes':
        topCauses = parseInt(args[++i], 10);
        break;
      case '--output':
        outputFile = args[++i];
        break;
      case '--json':
        jsonOutput = true;
        break;
    }
  }

  // Load incident config to get state store path
  const configPath = join(process.cwd(), 'config/proxy-mcp/incidents.json');
  let storeConfig: StateStoreConfig = {
    type: 'jsonl',
    path: '.taisun/incidents/state.jsonl',
    maxEntries: 10000,
    retentionDays: 30,
  };

  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.stateStore) {
        storeConfig = { ...storeConfig, ...config.stateStore };
      }
    } catch (e) {
      console.error('Warning: Could not load incidents.json config');
    }
  }

  // Check if state file exists
  if (!existsSync(storeConfig.path)) {
    console.log('No incident state file found. Creating empty digest.');
    console.log(`Expected path: ${storeConfig.path}`);
  }

  // Create store and generate digest
  const store = new JsonlIncidentStateStore(storeConfig);

  console.error(`Generating digest for last ${lookbackDays} days...`);

  const digest = await generateWeeklyDigest(store, {
    lookbackDays,
    topCauses,
  });

  // Output
  if (jsonOutput) {
    const json = JSON.stringify(digest, null, 2);
    if (outputFile) {
      writeFileSync(outputFile, json);
      console.error(`Wrote JSON to ${outputFile}`);
    } else {
      console.log(json);
    }
  } else {
    const markdown = digestToMarkdown(digest);
    if (outputFile) {
      writeFileSync(outputFile, markdown);
      console.error(`Wrote markdown to ${outputFile}`);
    } else {
      console.log(markdown);
    }
  }

  // Print summary
  console.error('');
  console.error('=== Digest Summary ===');
  console.error(`Period: ${digest.periodStart.split('T')[0]} to ${digest.periodEnd.split('T')[0]}`);
  console.error(`Total Incidents: ${digest.summary.totalIncidents}`);
  console.error(`Critical: ${digest.summary.criticalCount}`);
  console.error(`Top Causes: ${digest.topCauses.length}`);
  console.error(`Recommended Actions: ${digest.recommendedActions.length}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
