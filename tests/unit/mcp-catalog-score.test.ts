/**
 * MCP Catalog Scoring Tests - P9
 *
 * Tests for scoring and override functionality
 */

import {
  scoreEntry,
  applyOverride,
  applyOverrides,
  scoreCatalog,
  detectDuplicates,
  applyDuplicatePenalty,
  getTopCandidates,
  getCandidatesByCategory,
  getScoringStats,
  DEFAULT_SCORING_CONFIG,
} from '../../src/proxy-mcp/catalog/score';
import { CatalogEntry, OverridesConfig } from '../../src/proxy-mcp/catalog/types';

describe('MCP Catalog Scoring', () => {
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

  describe('DEFAULT_SCORING_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_SCORING_CONFIG.baseScore).toBe(50);
      expect(DEFAULT_SCORING_CONFIG.categoryScores.browser).toBe(20);
      expect(DEFAULT_SCORING_CONFIG.categoryScores.dangerous).toBe(-50);
    });
  });

  describe('scoreEntry', () => {
    it('should apply category bonus for browser', () => {
      const entry = createEntry({ category: 'browser' });
      const scored = scoreEntry(entry);

      expect(scored.finalScore).toBe(50 + 20); // base + browser bonus
    });

    it('should apply category penalty for dangerous', () => {
      const entry = createEntry({ category: 'dangerous' });
      const scored = scoreEntry(entry);

      expect(scored.finalScore).toBe(0); // base - 50 = 0 (clamped)
    });

    it('should apply priority keyword bonus', () => {
      const entry = createEntry({
        name: 'puppeteer-mcp',
        description: 'Browser automation with Puppeteer',
      });
      const scored = scoreEntry(entry);

      expect(scored.finalScore).toBeGreaterThan(50);
    });

    it('should apply risk pattern penalty', () => {
      const entry = createEntry({
        name: 'shell-exec-mcp',
        description: 'Execute shell commands',
      });
      const scored = scoreEntry(entry);

      expect(scored.finalScore).toBeLessThan(50);
    });

    it('should clamp score to 0-100', () => {
      const highEntry = createEntry({
        category: 'browser',
        name: 'puppeteer-fetch-api',
        description: 'browser http web',
        baseScore: 100,
      });
      const scored = scoreEntry(highEntry);
      expect(scored.finalScore).toBeLessThanOrEqual(100);

      const lowEntry = createEntry({
        category: 'dangerous',
        name: 'root-admin-shell-exec',
        description: 'root admin sudo shell execute',
        baseScore: 0,
      });
      const scoredLow = scoreEntry(lowEntry);
      expect(scoredLow.finalScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyOverride', () => {
    it('should apply score adjustment', () => {
      const entry = createEntry({ finalScore: 50 });
      const override = { scoreAdjustment: 10, reason: 'Test' };
      const result = applyOverride(entry, override);

      expect(result.finalScore).toBe(60);
    });

    it('should apply negative adjustment', () => {
      const entry = createEntry({ finalScore: 50 });
      const override = { scoreAdjustment: -30, reason: 'Dangerous' };
      const result = applyOverride(entry, override);

      expect(result.finalScore).toBe(20);
    });

    it('should set requireHuman from override', () => {
      const entry = createEntry({ requireHuman: false });
      const override = { scoreAdjustment: 0, reason: 'Test', requireHuman: true };
      const result = applyOverride(entry, override);

      expect(result.requireHuman).toBe(true);
    });

    it('should set blocked from override', () => {
      const entry = createEntry({ blocked: false });
      const override = { scoreAdjustment: 0, reason: 'Test', blocked: true };
      const result = applyOverride(entry, override);

      expect(result.blocked).toBe(true);
    });
  });

  describe('applyOverrides', () => {
    it('should apply overrides to matching entries', () => {
      const entries = [
        createEntry({ id: 'puppeteer-mcp', finalScore: 50 }),
        createEntry({ id: 'other-mcp', finalScore: 50 }),
      ];

      const overrides: OverridesConfig = {
        overrides: {
          'puppeteer-mcp': { scoreAdjustment: 10, reason: 'Priority' },
        },
      };

      const result = applyOverrides(entries, overrides);

      expect(result[0].finalScore).toBe(60);
      expect(result[1].finalScore).toBe(50);
    });
  });

  describe('scoreCatalog', () => {
    it('should score all entries', () => {
      const entries = [
        createEntry({ id: 'browser-mcp', category: 'browser' }),
        createEntry({ id: 'db-mcp', category: 'database' }),
      ];

      const scored = scoreCatalog(entries);

      expect(scored[0].finalScore).toBe(70); // 50 + 20 (browser)
      expect(scored[1].finalScore).toBe(60); // 50 + 10 (database)
    });

    it('should apply overrides when provided', () => {
      const entries = [
        createEntry({ id: 'test-mcp', category: 'other' }),
      ];

      const overrides: OverridesConfig = {
        overrides: {
          'test-mcp': { scoreAdjustment: 25, reason: 'Custom' },
        },
      };

      const scored = scoreCatalog(entries, DEFAULT_SCORING_CONFIG, overrides);

      expect(scored[0].finalScore).toBe(75);
    });
  });

  describe('detectDuplicates', () => {
    it('should detect similar entries in same category', () => {
      // Entries with same prefix after removing -mcp suffix
      const entries = [
        createEntry({ id: 'puppeteer-mcp', name: 'puppeteer-mcp', category: 'browser' }),
        createEntry({ id: 'puppeteer-v2-mcp', name: 'puppeteer-mcp', category: 'browser' }),
        createEntry({ id: 'postgres-mcp', name: 'postgres-mcp', category: 'database' }),
      ];

      const duplicates = detectDuplicates(entries);

      expect(duplicates.size).toBe(1);
      // Both entries have same category and same normalized name prefix
      const group = Array.from(duplicates.values())[0];
      expect(group).toHaveLength(2);
    });

    it('should not detect entries in different categories as duplicates', () => {
      const entries = [
        createEntry({ id: 'test-browser', name: 'test-mcp', category: 'browser' }),
        createEntry({ id: 'test-db', name: 'test-mcp', category: 'database' }),
      ];

      const duplicates = detectDuplicates(entries);

      expect(duplicates.size).toBe(0);
    });
  });

  describe('applyDuplicatePenalty', () => {
    it('should penalize lower-scored duplicates', () => {
      // Entries with same name (same group key)
      const entries = [
        createEntry({ id: 'puppeteer-a', name: 'puppeteer-mcp', category: 'browser', finalScore: 80 }),
        createEntry({ id: 'puppeteer-b', name: 'puppeteer-mcp', category: 'browser', finalScore: 70 }),
        createEntry({ id: 'puppeteer-c', name: 'puppeteer-mcp', category: 'browser', finalScore: 60 }),
      ];

      const penalized = applyDuplicatePenalty(entries, 10);

      expect(penalized[0].finalScore).toBe(80); // No penalty (highest)
      expect(penalized[1].finalScore).toBe(60); // -10 (second)
      expect(penalized[2].finalScore).toBe(40); // -20 (third)
    });
  });

  describe('getTopCandidates', () => {
    it('should return top N by score', () => {
      const entries = [
        createEntry({ id: 'low', finalScore: 30 }),
        createEntry({ id: 'high', finalScore: 90 }),
        createEntry({ id: 'medium', finalScore: 60 }),
      ];

      const top = getTopCandidates(entries, 2);

      expect(top).toHaveLength(2);
      expect(top[0].id).toBe('high');
      expect(top[1].id).toBe('medium');
    });

    it('should exclude blocked entries by default', () => {
      const entries = [
        createEntry({ id: 'blocked', finalScore: 100, blocked: true }),
        createEntry({ id: 'normal', finalScore: 50 }),
      ];

      const top = getTopCandidates(entries, 10);

      expect(top).toHaveLength(1);
      expect(top[0].id).toBe('normal');
    });
  });

  describe('getCandidatesByCategory', () => {
    it('should filter by category', () => {
      const entries = [
        createEntry({ id: 'browser-1', category: 'browser' }),
        createEntry({ id: 'browser-2', category: 'browser' }),
        createEntry({ id: 'db-1', category: 'database' }),
      ];

      const browsers = getCandidatesByCategory(entries, 'browser');

      expect(browsers).toHaveLength(2);
      expect(browsers.every((e) => e.category === 'browser')).toBe(true);
    });
  });

  describe('getScoringStats', () => {
    it('should calculate statistics', () => {
      const entries = [
        createEntry({ category: 'browser', riskLevel: 'low', finalScore: 80 }),
        createEntry({ category: 'browser', riskLevel: 'medium', finalScore: 60, requireHuman: true }),
        createEntry({ category: 'database', riskLevel: 'high', finalScore: 40, blocked: true }),
      ];

      const stats = getScoringStats(entries);

      expect(stats.total).toBe(3);
      expect(stats.byCategory.browser).toBe(2);
      expect(stats.byCategory.database).toBe(1);
      expect(stats.byRiskLevel.low).toBe(1);
      expect(stats.byRiskLevel.medium).toBe(1);
      expect(stats.byRiskLevel.high).toBe(1);
      expect(stats.blocked).toBe(1);
      expect(stats.requireHuman).toBe(1);
      expect(stats.avgScore).toBe(60);
    });
  });
});
