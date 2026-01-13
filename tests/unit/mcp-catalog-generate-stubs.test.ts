/**
 * MCP Catalog Stub Generator Tests - P9
 *
 * Tests for disabled stub generation
 */

import {
  inferCommand,
  inferRequiredEnv,
  generateStub,
  generateStubs,
  generateStubsFile,
  generateTopStubs,
  stubToInternalMcpConfig,
  generateInternalMcpsExample,
} from '../../src/proxy-mcp/catalog/generate-internal-stubs';
import { CatalogEntry, Catalog } from '../../src/proxy-mcp/catalog/types';

describe('MCP Catalog Stub Generator', () => {
  // Helper to create test entries
  function createEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
    return {
      id: 'test-mcp',
      name: 'test-mcp',
      description: 'A test MCP',
      url: 'https://github.com/example/test-mcp',
      category: 'other',
      sourceId: 'test-source',
      addedAt: new Date().toISOString(),
      riskLevel: 'low',
      tags: ['test'],
      baseScore: 50,
      finalScore: 50,
      requireHuman: false,
      blocked: false,
      ...overrides,
    };
  }

  function createCatalog(entries: CatalogEntry[]): Catalog {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: ['test-source'],
      entries,
    };
  }

  describe('inferCommand', () => {
    it('should infer npx command for Anthropic MCPs', () => {
      const entry = createEntry({
        url: 'https://github.com/anthropics/mcp-servers/tree/main/puppeteer',
        name: 'puppeteer-mcp',
      });

      const { command, args } = inferCommand(entry);

      expect(command).toBe('npx');
      expect(args).toContain('-y');
      expect(args.some((a) => a.includes('puppeteer'))).toBe(true);
    });

    it('should infer npx command for GitHub MCPs', () => {
      const entry = createEntry({
        url: 'https://github.com/example/my-awesome-mcp',
        name: 'my-awesome-mcp',
      });

      const { command, args } = inferCommand(entry);

      expect(command).toBe('npx');
      expect(args).toContain('-y');
    });

    it('should default to npx with example package', () => {
      const entry = createEntry({
        url: 'https://unknown-site.com/mcp',
        name: 'unknown-mcp',
      });

      const { command, args } = inferCommand(entry);

      expect(command).toBe('npx');
      expect(args).toContain('-y');
      expect(args.some((a) => a.includes('@example/'))).toBe(true);
    });
  });

  describe('inferRequiredEnv', () => {
    it('should infer database env vars', () => {
      const entry = createEntry({
        name: 'postgres-mcp',
        category: 'database',
        description: 'PostgreSQL integration',
      });

      const envVars = inferRequiredEnv(entry);

      expect(envVars.some((e) => e.includes('DATABASE'))).toBe(true);
    });

    it('should infer API key for web-api category', () => {
      const entry = createEntry({
        name: 'fetch-mcp',
        category: 'web-api',
        description: 'HTTP fetch operations',
      });

      const envVars = inferRequiredEnv(entry);

      expect(envVars.some((e) => e.includes('API_KEY'))).toBe(true);
    });

    it('should infer token for auth-related MCPs', () => {
      const entry = createEntry({
        name: 'github-mcp',
        description: 'GitHub integration with token auth',
      });

      const envVars = inferRequiredEnv(entry);

      expect(envVars.some((e) => e.includes('TOKEN'))).toBe(true);
    });
  });

  describe('generateStub', () => {
    it('should generate stub with enabled=false', () => {
      const entry = createEntry();
      const stub = generateStub(entry);

      expect(stub.enabled).toBe(false);
    });

    it('should include catalog metadata', () => {
      const entry = createEntry({
        id: 'my-mcp',
        riskLevel: 'medium',
        requireHuman: true,
      });

      const stub = generateStub(entry);

      expect(stub.catalogEntryId).toBe('my-mcp');
      expect(stub.riskLevel).toBe('medium');
      expect(stub.requireHuman).toBe(true);
    });

    it('should generate display name from entry name', () => {
      const entry = createEntry({ name: 'puppeteer-browser-mcp' });
      const stub = generateStub(entry);

      expect(stub.displayName).toBe('Puppeteer Browser');
    });

    it('should include default timeout and retry', () => {
      const entry = createEntry();
      const stub = generateStub(entry);

      expect(stub.timeout).toBe(30000);
      expect(stub.retry.maxAttempts).toBe(3);
      expect(stub.retry.delayMs).toBe(1000);
    });
  });

  describe('generateStubs', () => {
    it('should generate stubs for all non-blocked entries', () => {
      const entries = [
        createEntry({ id: 'normal-1' }),
        createEntry({ id: 'normal-2' }),
        createEntry({ id: 'blocked', blocked: true }),
      ];

      const stubs = generateStubs(entries);

      expect(stubs).toHaveLength(2);
      expect(stubs.every((s) => s.enabled === false)).toBe(true);
    });

    it('should exclude blocked entries', () => {
      const entries = [
        createEntry({ id: 'blocked-1', blocked: true }),
        createEntry({ id: 'blocked-2', blocked: true }),
      ];

      const stubs = generateStubs(entries);

      expect(stubs).toHaveLength(0);
    });
  });

  describe('generateStubsFile', () => {
    it('should create stubs file with metadata', () => {
      const catalog = createCatalog([
        createEntry({ id: 'mcp-1' }),
        createEntry({ id: 'mcp-2' }),
      ]);

      const file = generateStubsFile(catalog);

      expect(file.catalogVersion).toBe('1.0.0');
      expect(file.generatedAt).toBeDefined();
      expect(file.description).toContain('disabled');
      expect(file.stubs).toHaveLength(2);
    });
  });

  describe('generateTopStubs', () => {
    it('should generate stubs for top N by score', () => {
      const catalog = createCatalog([
        createEntry({ id: 'low', finalScore: 30 }),
        createEntry({ id: 'high', finalScore: 90 }),
        createEntry({ id: 'medium', finalScore: 60 }),
      ]);

      const file = generateTopStubs(catalog, 2);

      expect(file.stubs).toHaveLength(2);
      expect(file.stubs[0].catalogEntryId).toBe('high');
      expect(file.stubs[1].catalogEntryId).toBe('medium');
    });

    it('should respect blocked entries', () => {
      const catalog = createCatalog([
        createEntry({ id: 'blocked', finalScore: 100, blocked: true }),
        createEntry({ id: 'normal', finalScore: 50 }),
      ]);

      const file = generateTopStubs(catalog, 10);

      expect(file.stubs).toHaveLength(1);
      expect(file.stubs[0].catalogEntryId).toBe('normal');
    });
  });

  describe('stubToInternalMcpConfig', () => {
    it('should convert stub to internal MCP config format', () => {
      const stub = generateStub(createEntry({
        id: 'test-mcp',
        description: 'Test description',
        riskLevel: 'medium',
      }));

      const config = stubToInternalMcpConfig(stub);

      expect(config.enabled).toBe(false);
      expect(config.displayName).toBe(stub.displayName);
      expect(config.description).toBe(stub.description);
      expect(config.command).toBe(stub.command);
      expect(config.timeout).toBe(stub.timeout);
      expect(config.retry).toEqual(stub.retry);
      expect(config.tags).toContain('catalog:test-mcp');
      expect(config.tags).toContain('risk:medium');
      expect(config._catalogMetadata).toBeDefined();
    });

    it('should include requiredEnv with descriptions', () => {
      const stub = generateStub(createEntry({
        name: 'postgres-mcp',
        category: 'database',
      }));

      const config = stubToInternalMcpConfig(stub);

      expect(config.requiredEnv).toBeInstanceOf(Array);
      expect((config.requiredEnv as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('generateInternalMcpsExample', () => {
    it('should generate internal-mcps.local.example format', () => {
      const stubs = [
        generateStub(createEntry({ id: 'mcp-1' })),
        generateStub(createEntry({ id: 'mcp-2' })),
      ];

      const example = generateInternalMcpsExample(stubs);

      expect(example.$schema).toBeDefined();
      expect(example._comment).toContain('disabled');
      expect(example['mcp-1']).toBeDefined();
      expect(example['mcp-2']).toBeDefined();
    });

    it('should ensure all entries are disabled', () => {
      const stubs = [
        generateStub(createEntry({ id: 'test' })),
      ];

      const example = generateInternalMcpsExample(stubs);
      const entry = example['test'] as Record<string, unknown>;

      expect(entry.enabled).toBe(false);
    });
  });
});
