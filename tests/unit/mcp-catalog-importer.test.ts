/**
 * MCP Catalog Importer Tests - P9
 *
 * Tests for markdown parsing and catalog entry generation
 */

import {
  parseMarkdown,
  inferCategory,
  inferRiskLevel,
  generateId,
  extractTags,
  linkToCatalogEntry,
  importMarkdown,
} from '../../src/proxy-mcp/catalog/importers/markdown';
import { MCPCategory } from '../../src/proxy-mcp/catalog/types';

describe('MCP Catalog Importer', () => {
  describe('parseMarkdown', () => {
    it('should parse headings and links', () => {
      const markdown = `
# Main Title

## Browser Automation

- [puppeteer-mcp](https://github.com/example/puppeteer-mcp) - Browser automation with Puppeteer
- [playwright-mcp](https://github.com/example/playwright-mcp) - Browser automation with Playwright

## Database

- [postgres-mcp](https://github.com/example/postgres-mcp) - PostgreSQL integration
`;

      const sections = parseMarkdown(markdown);

      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('Browser Automation');
      expect(sections[0].level).toBe(2);
      expect(sections[0].links).toHaveLength(2);
      expect(sections[0].links[0].name).toBe('puppeteer-mcp');
      expect(sections[0].links[0].url).toBe('https://github.com/example/puppeteer-mcp');
      expect(sections[0].links[0].description).toBe('Browser automation with Puppeteer');

      expect(sections[1].heading).toBe('Database');
      expect(sections[1].links).toHaveLength(1);
    });

    it('should handle various link formats', () => {
      const markdown = `
## Links

- [name1](https://example.com/1) - description 1
* [name2](https://example.com/2) — description 2
- [name3](https://example.com/3)
`;

      const sections = parseMarkdown(markdown);

      expect(sections[0].links).toHaveLength(3);
      expect(sections[0].links[0].description).toBe('description 1');
      expect(sections[0].links[1].description).toBe('description 2');
      expect(sections[0].links[2].description).toBe('');
    });

    it('should skip sections without links', () => {
      const markdown = `
## Empty Section

No links here.

## Section with Links

- [link](https://example.com)
`;

      const sections = parseMarkdown(markdown);

      expect(sections).toHaveLength(1);
      expect(sections[0].heading).toBe('Section with Links');
    });
  });

  describe('inferCategory', () => {
    const testCases: [string, MCPCategory][] = [
      ['Browser Automation', 'browser'],
      ['Puppeteer Tools', 'browser'],
      ['File System', 'filesystem'],
      ['Storage', 'filesystem'],
      ['Database', 'database'],
      ['PostgreSQL', 'database'],
      ['Web & API', 'web-api'],
      ['HTTP Tools', 'web-api'],
      ['Development Tools', 'development'],
      ['Git Integration', 'development'],
      ['Cloud Services', 'cloud'],
      ['AWS', 'cloud'],
      ['Docker', 'cloud'],
      ['AI/ML', 'ai-ml'],
      ['Security', 'security'],
      ['Monitoring', 'monitoring'],
      ['Messaging', 'messaging'],
      ['Slack', 'messaging'],
      ['Dangerous Operations', 'dangerous'],
      ['Shell Execution', 'dangerous'],
      ['Unknown Category', 'other'],
    ];

    test.each(testCases)('should infer "%s" as "%s"', (heading, expected) => {
      expect(inferCategory(heading)).toBe(expected);
    });
  });

  describe('inferRiskLevel', () => {
    it('should detect critical risk', () => {
      expect(inferRiskLevel('root-access-mcp', 'Root access operations')).toBe('critical');
      expect(inferRiskLevel('admin-mcp', 'Administrative privileges')).toBe('critical');
    });

    it('should detect high risk', () => {
      expect(inferRiskLevel('shell-exec-mcp', 'Execute shell commands')).toBe('high');
      expect(inferRiskLevel('delete-all-mcp', 'Delete all data')).toBe('high');
      expect(inferRiskLevel('secret-manager', 'Manage credentials')).toBe('high');
    });

    it('should detect medium risk', () => {
      expect(inferRiskLevel('file-writer', 'Write files')).toBe('medium');
      expect(inferRiskLevel('aws-mcp', 'AWS cloud operations')).toBe('medium');
      expect(inferRiskLevel('postgres-mcp', 'Database queries')).toBe('medium');
    });

    it('should default to low risk', () => {
      expect(inferRiskLevel('fetch-mcp', 'Fetch web pages')).toBe('low');
      expect(inferRiskLevel('calculator', 'Simple calculations')).toBe('low');
    });
  });

  describe('generateId', () => {
    it('should generate valid IDs', () => {
      expect(generateId('Puppeteer MCP')).toBe('puppeteer-mcp');
      expect(generateId('GitHub-API')).toBe('github-api');
      expect(generateId('my_awesome_tool')).toBe('my-awesome-tool');
      expect(generateId('Tool123')).toBe('tool123');
    });

    it('should trim leading/trailing dashes', () => {
      expect(generateId('--test--')).toBe('test');
      expect(generateId('!!!test!!!')).toBe('test');
    });
  });

  describe('extractTags', () => {
    it('should extract category as tag', () => {
      const tags = extractTags('test-mcp', 'A test tool', 'browser');
      expect(tags).toContain('browser');
    });

    it('should extract technology tags', () => {
      const tags = extractTags('puppeteer-mcp', 'Browser automation with Puppeteer', 'browser');
      expect(tags).toContain('puppeteer');
    });

    it('should extract multiple technology tags', () => {
      const tags = extractTags('github-git-mcp', 'GitHub and Git integration', 'development');
      expect(tags).toContain('github');
      expect(tags).toContain('git');
    });
  });

  describe('linkToCatalogEntry', () => {
    it('should create catalog entry from link', () => {
      const link = {
        name: 'puppeteer-mcp',
        url: 'https://github.com/example/puppeteer-mcp',
        description: 'Browser automation with Puppeteer',
      };

      const entry = linkToCatalogEntry(link, 'browser', 'test-source');

      expect(entry.id).toBe('puppeteer-mcp');
      expect(entry.name).toBe('puppeteer-mcp');
      expect(entry.description).toBe('Browser automation with Puppeteer');
      expect(entry.url).toBe('https://github.com/example/puppeteer-mcp');
      expect(entry.category).toBe('browser');
      expect(entry.sourceId).toBe('test-source');
      expect(entry.riskLevel).toBe('low');
      expect(entry.tags).toContain('browser');
      expect(entry.tags).toContain('puppeteer');
      expect(entry.baseScore).toBe(50);
      expect(entry.requireHuman).toBe(false);
      expect(entry.blocked).toBe(false);
    });

    it('should mark high-risk entries as requireHuman', () => {
      const link = {
        name: 'shell-exec-mcp',
        url: 'https://github.com/example/shell-exec-mcp',
        description: 'Execute shell commands',
      };

      const entry = linkToCatalogEntry(link, 'dangerous', 'test-source');

      expect(entry.riskLevel).toBe('high');
      expect(entry.requireHuman).toBe(true);
    });

    it('should mark critical-risk entries as blocked', () => {
      const link = {
        name: 'root-access-mcp',
        url: 'https://github.com/example/root-access-mcp',
        description: 'Root access operations',
      };

      const entry = linkToCatalogEntry(link, 'dangerous', 'test-source');

      expect(entry.riskLevel).toBe('critical');
      expect(entry.requireHuman).toBe(true);
      expect(entry.blocked).toBe(true);
    });
  });

  describe('importMarkdown', () => {
    it('should import full markdown document', () => {
      const markdown = `
# Awesome MCP Servers

## Browser Automation

- [puppeteer-mcp](https://github.com/example/puppeteer-mcp) - Browser automation with Puppeteer
- [playwright-mcp](https://github.com/example/playwright-mcp) - Browser automation with Playwright

## Database

- [postgres-mcp](https://github.com/example/postgres-mcp) - PostgreSQL integration
`;

      const entries = importMarkdown(markdown, 'test-source');

      expect(entries).toHaveLength(3);
      expect(entries[0].category).toBe('browser');
      expect(entries[1].category).toBe('browser');
      expect(entries[2].category).toBe('database');
    });

    it('should deduplicate entries by ID', () => {
      const markdown = `
## Section 1

- [duplicate-mcp](https://github.com/example/1) - First instance

## Section 2

- [duplicate-mcp](https://github.com/example/2) - Second instance (duplicate)
`;

      const entries = importMarkdown(markdown, 'test-source');

      expect(entries).toHaveLength(1);
      expect(entries[0].url).toBe('https://github.com/example/1');
    });
  });
});
