#!/usr/bin/env npx ts-node
/**
 * Add Internal MCP Script
 *
 * Automates the process of adding a new internal MCP:
 * 1. Adds entry to .mcp.full.json (disabled, as catalog)
 * 2. Adds entry to config/proxy-mcp/internal-mcps.json (with triggers)
 * 3. Generates skill template(s) in .claude/skills/
 *
 * Usage:
 *   npx ts-node scripts/add-internal-mcp.ts --config mcp-config.json
 *   npx ts-node scripts/add-internal-mcp.ts --interactive
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface McpTriggerConfig {
  fileExts?: string[];
  mimeTypes?: string[];
  urlSuffixes?: string[];
  keywords?: string[];
  deferredOnly?: boolean;
}

interface McpResilienceConfig {
  timeout?: { spawnMs?: number; toolCallMs?: number };
  retry?: { maxAttempts?: number; backoffMs?: number; jitter?: boolean };
  circuit?: { enabled?: boolean; failureThreshold?: number; cooldownMs?: number };
}

interface NewMcpConfig {
  name: string;
  npmPackage: string;
  description: string;
  category: string;
  tags: string[];
  tools: string[];
  triggers?: McpTriggerConfig;
  resilience?: McpResilienceConfig;
  skills?: Array<{
    name: string;
    description: string;
    parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  }>;
}

const PROJECT_ROOT = process.cwd();
const MCP_FULL_PATH = path.join(PROJECT_ROOT, '.mcp.full.json');
const INTERNAL_MCPS_PATH = path.join(PROJECT_ROOT, 'config', 'proxy-mcp', 'internal-mcps.json');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

function loadJson(filepath: string): unknown {
  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

function saveJson(filepath: string, data: unknown): void {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
}

function addToMcpFull(config: NewMcpConfig): void {
  const mcpFull = loadJson(MCP_FULL_PATH) as { mcpServers: Record<string, unknown> };

  if (mcpFull.mcpServers[config.name]) {
    console.log(`[SKIP] ${config.name} already exists in .mcp.full.json`);
    return;
  }

  mcpFull.mcpServers[config.name] = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', config.npmPackage],
    disabled: true,
    description: config.description,
    category: config.category,
    note: `Internal MCP - routed via taisun-proxy. Triggers: ${config.triggers?.deferredOnly ? 'deferred' : 'always'}`,
  };

  saveJson(MCP_FULL_PATH, mcpFull);
  console.log(`[OK] Added ${config.name} to .mcp.full.json (disabled)`);
}

function addToInternalMcps(config: NewMcpConfig): void {
  const internalMcps = loadJson(INTERNAL_MCPS_PATH) as {
    version: string;
    mcps: Array<{ name: string; [key: string]: unknown }>;
    routerConfig: unknown;
  };

  if (internalMcps.mcps.some((m) => m.name === config.name)) {
    console.log(`[SKIP] ${config.name} already exists in internal-mcps.json`);
    return;
  }

  const newMcp = {
    name: config.name,
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', config.npmPackage],
    enabled: true,
    versionPin: 'latest',
    requiredEnv: [] as string[],
    tags: config.tags,
    shortDescription: config.description,
    dangerousOperations: [] as string[],
    allowlist: config.tools,
    resilience: config.resilience || {
      timeout: { spawnMs: 15000, toolCallMs: 60000 },
      retry: { maxAttempts: 2, backoffMs: 1000, jitter: true },
      circuit: { enabled: true, failureThreshold: 3, cooldownMs: 60000 },
    },
    triggers: config.triggers,
  };

  internalMcps.mcps.unshift(newMcp);
  saveJson(INTERNAL_MCPS_PATH, internalMcps);
  console.log(`[OK] Added ${config.name} to internal-mcps.json`);
}

function generateSkillTemplate(config: NewMcpConfig): void {
  if (!config.skills || config.skills.length === 0) {
    console.log(`[SKIP] No skills defined for ${config.name}`);
    return;
  }

  for (const skill of config.skills) {
    const skillDir = path.join(SKILLS_DIR, skill.name);

    if (fs.existsSync(skillDir)) {
      console.log(`[SKIP] Skill ${skill.name} already exists`);
      continue;
    }

    fs.mkdirSync(skillDir, { recursive: true });

    const paramsTable = skill.parameters
      .map((p) => `| ${p.name} | ${p.type} | ${p.required ? 'Yes' : 'No'} | ${p.description} |`)
      .join('\n');

    const triggersYaml = config.triggers
      ? `triggers:
  fileExts: [${config.triggers.fileExts?.join(', ') || ''}]
  mimeTypes: [${config.triggers.mimeTypes?.join(', ') || ''}]
  urlSuffixes: [${config.triggers.urlSuffixes?.join(', ') || ''}]`
      : '';

    const skillMd = `---
name: ${skill.name}
description: ${skill.description}
${triggersYaml}
---

# ${skill.name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

${skill.description}

## Instructions

1. Receive input parameters
2. Execute ${config.name} MCP tool
3. Return result (large outputs stored in memory)

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
${paramsTable}

## Usage Examples

\`\`\`
skill.run("${skill.name.replace(/-/g, '.')}", {
  // Add parameters here
})
\`\`\`

## Notes

- Part of ${config.name} MCP integration
- Large outputs are stored in memory with referenceId
`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
    console.log(`[OK] Generated skill template: ${skill.name}`);
  }
}

async function interactiveMode(): Promise<NewMcpConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log('\n=== Add Internal MCP (Interactive) ===\n');

  const name = await question('MCP name (e.g., pdf-reader): ');
  const npmPackage = await question('NPM package (e.g., @sylphx/pdf-reader-mcp): ');
  const description = await question('Description: ');
  const category = await question('Category (e.g., document, development): ');
  const tags = (await question('Tags (comma-separated): ')).split(',').map((t) => t.trim());
  const tools = (await question('Tool names (comma-separated): ')).split(',').map((t) => t.trim());

  const hasTriggers = (await question('Has triggers? (y/n): ')).toLowerCase() === 'y';
  let triggers: McpTriggerConfig | undefined;

  if (hasTriggers) {
    const fileExts = (await question('File extensions (comma-separated, e.g., pdf,PDF): '))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const mimeTypes = (await question('MIME types (comma-separated): '))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const urlSuffixes = (await question('URL suffixes (comma-separated, e.g., .pdf): '))
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const deferredOnly = (await question('Deferred only? (y/n): ')).toLowerCase() === 'y';

    triggers = {
      fileExts: fileExts.length > 0 ? fileExts : undefined,
      mimeTypes: mimeTypes.length > 0 ? mimeTypes : undefined,
      urlSuffixes: urlSuffixes.length > 0 ? urlSuffixes : undefined,
      deferredOnly,
    };
  }

  rl.close();

  return {
    name,
    npmPackage,
    description,
    category,
    tags,
    tools,
    triggers,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let config: NewMcpConfig;

  if (args.includes('--interactive') || args.includes('-i')) {
    config = await interactiveMode();
  } else if (args.includes('--config') || args.includes('-c')) {
    const configIndex = args.indexOf('--config') !== -1 ? args.indexOf('--config') : args.indexOf('-c');
    const configPath = args[configIndex + 1];
    if (!configPath) {
      console.error('Error: --config requires a path argument');
      process.exit(1);
    }
    config = loadJson(configPath) as NewMcpConfig;
  } else {
    console.log(`
Usage:
  npx ts-node scripts/add-internal-mcp.ts --interactive
  npx ts-node scripts/add-internal-mcp.ts --config mcp-config.json

Example config file:
{
  "name": "pdf-reader",
  "npmPackage": "@sylphx/pdf-reader-mcp",
  "description": "PDF reading and text extraction",
  "category": "document",
  "tags": ["pdf", "document", "extract"],
  "tools": ["read_pdf"],
  "triggers": {
    "fileExts": ["pdf", "PDF"],
    "mimeTypes": ["application/pdf"],
    "urlSuffixes": [".pdf"],
    "deferredOnly": true
  },
  "skills": [
    {
      "name": "pdf-inspect",
      "description": "Get PDF overview",
      "parameters": [
        { "name": "source", "type": "string", "required": true, "description": "PDF path or URL" }
      ]
    }
  ]
}
`);
    process.exit(0);
  }

  console.log('\n=== Adding Internal MCP ===\n');
  console.log('Config:', JSON.stringify(config, null, 2));
  console.log('');

  addToMcpFull(config);
  addToInternalMcps(config);
  generateSkillTemplate(config);

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
