#!/usr/bin/env npx ts-node
/**
 * MCP Catalog Import CLI - P9
 *
 * Imports MCP entries from markdown fixture files into catalog.json
 *
 * Usage:
 *   npx ts-node scripts/mcp-catalog/import.ts [fixture-path]
 *
 * Default: catalog/mcp/fixtures/awesome_mcp_servers.sample.md
 *
 * @istanbul ignore file
 */

import * as fs from 'fs';
import * as path from 'path';
import { importMarkdown } from '../../src/proxy-mcp/catalog/importers/markdown';
import { Catalog } from '../../src/proxy-mcp/catalog/types';

const CATALOG_DIR = path.join(process.cwd(), 'catalog/mcp');
const DEFAULT_FIXTURE = path.join(CATALOG_DIR, 'fixtures/awesome_mcp_servers.sample.md');
const CATALOG_OUTPUT = path.join(CATALOG_DIR, 'catalog.json');

async function main(): Promise<void> {
  const fixturePath = process.argv[2] || DEFAULT_FIXTURE;

  console.log(`[import] Reading fixture: ${fixturePath}`);

  if (!fs.existsSync(fixturePath)) {
    console.error(`[import] ✗ Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fixturePath, 'utf-8');
  const sourceId = path.basename(fixturePath, path.extname(fixturePath));

  console.log(`[import] Parsing markdown...`);
  const entries = importMarkdown(content, sourceId);

  console.log(`[import] Found ${entries.length} entries`);

  // Load existing catalog or create new
  let catalog: Catalog;
  if (fs.existsSync(CATALOG_OUTPUT)) {
    const existing = JSON.parse(fs.readFileSync(CATALOG_OUTPUT, 'utf-8')) as Catalog;
    // Merge entries (new entries override existing with same id)
    const existingMap = new Map(existing.entries.map((e) => [e.id, e]));
    for (const entry of entries) {
      existingMap.set(entry.id, entry);
    }
    catalog = {
      version: existing.version,
      generatedAt: new Date().toISOString(),
      sources: [...new Set([...existing.sources, sourceId])],
      entries: Array.from(existingMap.values()),
    };
  } else {
    catalog = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: [sourceId],
      entries,
    };
  }

  // Write catalog
  fs.writeFileSync(CATALOG_OUTPUT, JSON.stringify(catalog, null, 2));

  console.log(`[import] ✓ Wrote ${catalog.entries.length} entries to ${CATALOG_OUTPUT}`);
  console.log(`[import] Sources: ${catalog.sources.join(', ')}`);

  // Show category breakdown
  const byCategory = new Map<string, number>();
  for (const entry of catalog.entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) || 0) + 1);
  }
  console.log(`[import] Categories:`);
  for (const [cat, count] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`[import]   ${cat}: ${count}`);
  }
}

main().catch((err) => {
  console.error('[import] ✗ Error:', err.message);
  process.exit(1);
});
