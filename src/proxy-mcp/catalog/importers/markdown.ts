/**
 * Markdown Importer - P9
 *
 * Parses awesome-list style markdown files to extract MCP candidates.
 *
 * Supports:
 * - Heading-based categories (## Category Name)
 * - Link extraction ([name](url) - description)
 * - Description after links
 */

import {
  ParsedSection,
  ParsedLink,
  CatalogEntry,
  MCPCategory,
  RiskLevel,
} from '../types';

/**
 * Category mapping from heading text
 */
const CATEGORY_MAPPING: Record<string, MCPCategory> = {
  browser: 'browser',
  'browser automation': 'browser',
  puppeteer: 'browser',
  playwright: 'browser',
  chrome: 'browser',
  selenium: 'browser',

  file: 'filesystem',
  filesystem: 'filesystem',
  'file system': 'filesystem',
  storage: 'filesystem',

  database: 'database',
  postgres: 'database',
  postgresql: 'database',
  mysql: 'database',
  sqlite: 'database',
  mongodb: 'database',
  redis: 'database',

  web: 'web-api',
  api: 'web-api',
  'web & api': 'web-api',
  http: 'web-api',
  fetch: 'web-api',
  rest: 'web-api',
  graphql: 'web-api',

  development: 'development',
  dev: 'development',
  'development tools': 'development',
  git: 'development',
  github: 'development',
  gitlab: 'development',

  cloud: 'cloud',
  aws: 'cloud',
  azure: 'cloud',
  gcp: 'cloud',
  'google cloud': 'cloud',
  infrastructure: 'cloud',
  docker: 'cloud',
  kubernetes: 'cloud',

  ai: 'ai-ml',
  ml: 'ai-ml',
  'ai-ml': 'ai-ml',
  llm: 'ai-ml',
  'machine learning': 'ai-ml',

  security: 'security',
  auth: 'security',
  authentication: 'security',
  encryption: 'security',

  monitoring: 'monitoring',
  observability: 'monitoring',
  logging: 'monitoring',
  metrics: 'monitoring',

  messaging: 'messaging',
  slack: 'messaging',
  discord: 'messaging',
  email: 'messaging',
  notification: 'messaging',

  dangerous: 'dangerous',
  'dangerous operations': 'dangerous',
  shell: 'dangerous',
  exec: 'dangerous',
  root: 'dangerous',
  admin: 'dangerous',
};

/**
 * Risk keywords and their levels
 */
const RISK_KEYWORDS: { pattern: RegExp; level: RiskLevel }[] = [
  { pattern: /\b(root|admin|sudo|privilege)\b/i, level: 'critical' },
  { pattern: /\b(shell|exec|execute|command)\b/i, level: 'high' },
  { pattern: /\b(delete|remove|destroy|drop)\b/i, level: 'high' },
  { pattern: /\b(credential|secret|password|token|key)\b/i, level: 'high' },
  { pattern: /\b(write|modify|update|create)\b/i, level: 'medium' },
  { pattern: /\b(cloud|aws|azure|gcp)\b/i, level: 'medium' },
  { pattern: /\b(database|postgres|mysql|mongo)\b/i, level: 'medium' },
];

/**
 * Parse markdown content to extract sections and links
 */
export function parseMarkdown(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    // Check for heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if exists
      if (currentSection && currentSection.links.length > 0) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        links: [],
      };
      continue;
    }

    // Check for link (- [name](url) - description)
    const linkMatch = line.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*[-–—]\s*(.+))?/);
    if (linkMatch && currentSection) {
      currentSection.links.push({
        name: linkMatch[1].trim(),
        url: linkMatch[2].trim(),
        description: linkMatch[3]?.trim() || '',
      });
    }
  }

  // Don't forget the last section
  if (currentSection && currentSection.links.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Infer category from heading text
 */
export function inferCategory(heading: string): MCPCategory {
  const normalizedHeading = heading.toLowerCase();

  for (const [keyword, category] of Object.entries(CATEGORY_MAPPING)) {
    if (normalizedHeading.includes(keyword)) {
      return category;
    }
  }

  return 'other';
}

/**
 * Infer risk level from name and description
 */
export function inferRiskLevel(name: string, description: string): RiskLevel {
  const text = `${name} ${description}`.toLowerCase();

  for (const { pattern, level } of RISK_KEYWORDS) {
    if (pattern.test(text)) {
      return level;
    }
  }

  return 'low';
}

/**
 * Generate ID from name
 */
export function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract tags from name and description
 */
export function extractTags(
  name: string,
  description: string,
  category: MCPCategory
): string[] {
  const tags: string[] = [category];
  const text = `${name} ${description}`.toLowerCase();

  // Add technology-specific tags
  const techPatterns: [RegExp, string][] = [
    [/\bpuppeteer\b/i, 'puppeteer'],
    [/\bplaywright\b/i, 'playwright'],
    [/\bselenium\b/i, 'selenium'],
    [/\bpostgres(ql)?\b/i, 'postgres'],
    [/\bmysql\b/i, 'mysql'],
    [/\bmongodb?\b/i, 'mongodb'],
    [/\bredis\b/i, 'redis'],
    [/\bgithub\b/i, 'github'],
    [/\bgitlab\b/i, 'gitlab'],
    [/\bgit\b/i, 'git'],
    [/\baws\b/i, 'aws'],
    [/\bazure\b/i, 'azure'],
    [/\bgcp|google cloud\b/i, 'gcp'],
    [/\bdocker\b/i, 'docker'],
    [/\bkubernetes|k8s\b/i, 'kubernetes'],
    [/\bslack\b/i, 'slack'],
    [/\bdiscord\b/i, 'discord'],
    [/\bemail\b/i, 'email'],
    [/\bhttp|fetch\b/i, 'http'],
    [/\brest\b/i, 'rest'],
    [/\bgraphql\b/i, 'graphql'],
  ];

  for (const [pattern, tag] of techPatterns) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Convert parsed link to catalog entry
 */
export function linkToCatalogEntry(
  link: ParsedLink,
  category: MCPCategory,
  sourceId: string
): CatalogEntry {
  const id = generateId(link.name);
  const riskLevel = inferRiskLevel(link.name, link.description);
  const tags = extractTags(link.name, link.description, category);

  // Base score (will be adjusted by scoring module)
  const baseScore = 50;

  return {
    id,
    name: link.name,
    description: link.description || `${link.name} MCP server`,
    url: link.url,
    category,
    sourceId,
    addedAt: new Date().toISOString(),
    riskLevel,
    tags,
    baseScore,
    finalScore: baseScore,
    requireHuman: riskLevel === 'critical' || riskLevel === 'high',
    blocked: riskLevel === 'critical',
  };
}

/**
 * Import markdown content to catalog entries
 */
export function importMarkdown(
  content: string,
  sourceId: string
): CatalogEntry[] {
  const sections = parseMarkdown(content);
  const entries: CatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const section of sections) {
    const category = inferCategory(section.heading);

    for (const link of section.links) {
      const entry = linkToCatalogEntry(link, category, sourceId);

      // Skip duplicates
      if (seenIds.has(entry.id)) {
        continue;
      }

      seenIds.add(entry.id);
      entries.push(entry);
    }
  }

  return entries;
}
