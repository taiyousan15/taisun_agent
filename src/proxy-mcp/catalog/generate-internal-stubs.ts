/**
 * Internal MCP Stub Generator - P9
 *
 * Generates disabled stubs for internal-mcps.local.example.*.json
 *
 * IMPORTANT:
 * - All generated stubs are DISABLED by default
 * - No real credentials are included (only placeholders)
 * - Production enablement requires Phase 6 rollout
 */

import {
  CatalogEntry,
  GeneratedStub,
  GeneratedStubsFile,
  Catalog,
} from './types';

/**
 * Default timeout for MCP stubs (ms)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Default retry configuration
 */
const DEFAULT_RETRY = {
  maxAttempts: 3,
  delayMs: 1000,
};

/**
 * Command templates based on URL patterns
 */
const COMMAND_TEMPLATES: {
  pattern: RegExp;
  command: string;
  args: string[];
  envPrefix: string;
}[] = [
  {
    pattern: /github\.com\/anthropics\/mcp-servers/,
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-{{name}}'],
    envPrefix: 'ANTHROPIC_',
  },
  {
    pattern: /github\.com\/[^/]+\/[^/]+-mcp/,
    command: 'npx',
    args: ['-y', '{{package}}'],
    envPrefix: '',
  },
  {
    pattern: /npmjs\.com\/package\//,
    command: 'npx',
    args: ['-y', '{{package}}'],
    envPrefix: '',
  },
];

/**
 * Environment variable templates based on category
 */
const ENV_TEMPLATES: Record<string, string[]> = {
  database: ['{{PREFIX}}DATABASE_URL', '{{PREFIX}}CONNECTION_STRING'],
  cloud: ['{{PREFIX}}API_KEY', '{{PREFIX}}ACCESS_KEY', '{{PREFIX}}SECRET_KEY'],
  'web-api': ['{{PREFIX}}API_KEY'],
  messaging: ['{{PREFIX}}API_TOKEN', '{{PREFIX}}WEBHOOK_URL'],
  development: ['{{PREFIX}}TOKEN', '{{PREFIX}}API_KEY'],
  security: ['{{PREFIX}}SECRET', '{{PREFIX}}KEY'],
};

/**
 * Infer command and args from catalog entry URL
 */
export function inferCommand(entry: CatalogEntry): { command: string; args: string[] } {
  for (const template of COMMAND_TEMPLATES) {
    if (template.pattern.test(entry.url)) {
      const name = entry.name.replace(/-mcp$/i, '');
      const packageName = extractPackageName(entry.url) || `@example/${name}-mcp`;

      const args = template.args.map((arg) =>
        arg
          .replace('{{name}}', name)
          .replace('{{package}}', packageName)
      );

      return { command: template.command, args };
    }
  }

  // Default: assume npx with package name derived from entry name
  return {
    command: 'npx',
    args: ['-y', `@example/${entry.name}`],
  };
}

/**
 * Extract package name from URL
 */
function extractPackageName(url: string): string | null {
  // npm package URL
  const npmMatch = url.match(/npmjs\.com\/package\/(@?[^/]+(?:\/[^/]+)?)/);
  if (npmMatch) {
    return npmMatch[1];
  }

  // GitHub package (assume same as repo name)
  const githubMatch = url.match(/github\.com\/[^/]+\/([^/]+)/);
  if (githubMatch) {
    return githubMatch[1];
  }

  return null;
}

/**
 * Infer required environment variables from catalog entry
 */
export function inferRequiredEnv(entry: CatalogEntry): string[] {
  const prefix = entry.name
    .replace(/-mcp$/i, '')
    .replace(/-/g, '_')
    .toUpperCase();

  // Get category-specific env vars
  const categoryEnv = ENV_TEMPLATES[entry.category] || [];
  const envVars = categoryEnv.map((env) => env.replace('{{PREFIX}}', `${prefix}_`));

  // Add common env vars based on keywords
  const text = `${entry.name} ${entry.description}`.toLowerCase();

  if (/api|http|web|fetch/.test(text) && !envVars.some((e) => e.includes('API_KEY'))) {
    envVars.push(`${prefix}_API_KEY`);
  }

  if (/auth|token/.test(text) && !envVars.some((e) => e.includes('TOKEN'))) {
    envVars.push(`${prefix}_TOKEN`);
  }

  if (/database|db|postgres|mysql|mongo/.test(text) && !envVars.some((e) => e.includes('DATABASE'))) {
    envVars.push(`${prefix}_DATABASE_URL`);
  }

  // Return unique, non-empty vars
  return [...new Set(envVars)].filter(Boolean);
}

/**
 * Generate a stub from a catalog entry
 */
export function generateStub(entry: CatalogEntry): GeneratedStub {
  const { command, args } = inferCommand(entry);
  const requiredEnv = inferRequiredEnv(entry);

  // Display name: capitalize and remove -mcp suffix
  const displayName = entry.name
    .replace(/-mcp$/i, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    name: entry.id,
    displayName,
    description: entry.description,
    command,
    args,
    requiredEnv,
    enabled: false, // ALWAYS disabled for generated stubs
    timeout: DEFAULT_TIMEOUT,
    retry: { ...DEFAULT_RETRY },
    catalogEntryId: entry.id,
    riskLevel: entry.riskLevel,
    requireHuman: entry.requireHuman,
  };
}

/**
 * Generate stubs for all catalog entries
 */
export function generateStubs(entries: CatalogEntry[]): GeneratedStub[] {
  return entries
    .filter((e) => !e.blocked) // Skip blocked entries
    .map(generateStub);
}

/**
 * Generate stubs file from catalog
 */
export function generateStubsFile(catalog: Catalog): GeneratedStubsFile {
  const stubs = generateStubs(catalog.entries);

  return {
    $schema: './internal-mcps.local.example.schema.json',
    generatedAt: new Date().toISOString(),
    catalogVersion: catalog.version,
    description:
      'Auto-generated disabled stubs from MCP catalog. ' +
      'Enable individually via Phase 6 rollout. ' +
      'DO NOT commit real credentials.',
    stubs,
  };
}

/**
 * Generate stubs for top N candidates
 */
export function generateTopStubs(
  catalog: Catalog,
  limit: number = 20
): GeneratedStubsFile {
  // Get non-blocked entries sorted by score
  const topEntries = catalog.entries
    .filter((e) => !e.blocked)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  const stubs = topEntries.map(generateStub);

  return {
    $schema: './internal-mcps.local.example.schema.json',
    generatedAt: new Date().toISOString(),
    catalogVersion: catalog.version,
    description:
      `Top ${limit} MCP candidates (disabled stubs). ` +
      'Enable individually via Phase 6 rollout.',
    stubs,
  };
}

/**
 * Convert generated stub to internal-mcps.local.json format
 */
export function stubToInternalMcpConfig(stub: GeneratedStub): Record<string, unknown> {
  return {
    displayName: stub.displayName,
    description: stub.description,
    command: stub.command,
    args: stub.args,
    enabled: false, // ALWAYS disabled
    timeout: stub.timeout,
    retry: stub.retry,
    requiredEnv: stub.requiredEnv.map((env) => ({
      name: env,
      description: `Required for ${stub.displayName}`,
    })),
    tags: [`catalog:${stub.catalogEntryId}`, `risk:${stub.riskLevel}`],
    requireHuman: stub.requireHuman,
    _catalogMetadata: {
      entryId: stub.catalogEntryId,
      riskLevel: stub.riskLevel,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate internal-mcps.local.example.json content
 */
export function generateInternalMcpsExample(
  stubs: GeneratedStub[]
): Record<string, unknown> {
  const mcps: Record<string, unknown> = {};

  for (const stub of stubs) {
    mcps[stub.name] = stubToInternalMcpConfig(stub);
  }

  return {
    $schema: './internal-mcps.schema.json',
    _comment:
      'Auto-generated disabled stubs from MCP catalog. ' +
      'Copy entries to internal-mcps.local.json and enable via Phase 6 rollout.',
    ...mcps,
  };
}
