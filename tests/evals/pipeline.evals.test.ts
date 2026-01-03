/**
 * Pipeline Evals - P10
 *
 * Regression tests for pipeline.web_skillize contracts:
 * - A) mode=tabs: Returns summary+refId only (no URL lists)
 * - B) mode=refId: Requires inputRefId, returns summary+refId only
 * - C) confirmWrite=true: Enters approval flow (doesn't write without approval)
 *
 * All tests use mocks - no network/CDP dependency
 */

import {
  runPipelineTabsSkillize,
  PipelineResult,
  DEFAULT_PIPELINE_CONFIG,
} from '../../src/proxy-mcp/browser/pipeline-tabs-skillize';
import { memoryAdd } from '../../src/proxy-mcp/tools/memory';

// Mock CDP
jest.mock('../../src/proxy-mcp/browser/cdp', () => ({
  listTabsViaCDP: jest.fn(),
}));

// Mock memory
jest.mock('../../src/proxy-mcp/tools/memory', () => ({
  memoryAdd: jest.fn(),
}));

// Mock observability
jest.mock('../../src/proxy-mcp/observability', () => ({
  recordEvent: jest.fn(),
}));

// Mock normalize
jest.mock('../../src/proxy-mcp/browser/url-bundle', () => ({
  normalizeUrlBundle: jest.fn(),
}));

// Mock skillize
jest.mock('../../src/proxy-mcp/browser/url-bundle-skillize', () => ({
  batchSkillizeUrlBundle: jest.fn(),
}));

import { listTabsViaCDP } from '../../src/proxy-mcp/browser/cdp';
import { normalizeUrlBundle } from '../../src/proxy-mcp/browser/url-bundle';
import { batchSkillizeUrlBundle } from '../../src/proxy-mcp/browser/url-bundle-skillize';

const mockListTabs = listTabsViaCDP as jest.Mock;
const mockNormalize = normalizeUrlBundle as jest.Mock;
const mockSkillize = batchSkillizeUrlBundle as jest.Mock;
const mockMemoryAdd = memoryAdd as jest.Mock;

describe('Pipeline Evals - Contract Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockMemoryAdd.mockResolvedValue({
      success: true,
      referenceId: 'ref-test-123',
    });
  });

  describe('Contract A: mode=tabs returns summary+refId only', () => {
    it('should return only summary and refId, not URL lists', async () => {
      // Setup mocks for successful pipeline
      mockListTabs.mockResolvedValue({
        success: true,
        data: {
          tabs: [
            { url: 'https://docs.example.com/page1', title: 'Page 1' },
            { url: 'https://docs.example.com/page2', title: 'Page 2' },
          ],
          totalTabs: 2,
        },
      });

      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref-123',
        data: {
          inputCount: 2,
          outputCount: 2,
          duplicatesRemoved: 0,
        },
      });

      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref-123',
        data: {
          processedCount: 2,
          successCount: 2,
          failureCount: 0,
          dryRun: true,
        },
      });

      const result = await runPipelineTabsSkillize({});

      // Contract: Must have summary and refId
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.refId).toBeDefined();

      // Contract: Summary must NOT contain raw URL lists
      expect(result.summary).not.toContain('https://docs.example.com/page1');
      expect(result.summary).not.toContain('https://docs.example.com/page2');

      // Contract: Summary should contain stage info
      expect(result.summary).toContain('Pipeline');
      expect(result.summary).toContain('Stages');
    });

    it('should indicate dry-run mode in summary when confirmWrite=false', async () => {
      mockListTabs.mockResolvedValue({
        success: true,
        data: { tabs: [], totalTabs: 0 },
      });
      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref',
        data: { inputCount: 0, outputCount: 0, duplicatesRemoved: 0 },
      });
      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref',
        data: { processedCount: 0, successCount: 0, failureCount: 0, dryRun: true },
      });

      const result = await runPipelineTabsSkillize({ confirmWrite: false });

      expect(result.summary).toContain('DRY-RUN');
    });
  });

  describe('Contract B: mode=refId requires inputRefId', () => {
    it('should skip tabs collection when inputRefId is provided', async () => {
      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref-123',
        data: { inputCount: 5, outputCount: 5, duplicatesRemoved: 0 },
      });

      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref-123',
        data: { processedCount: 5, successCount: 5, failureCount: 0, dryRun: true },
      });

      const result = await runPipelineTabsSkillize({
        inputRefId: 'existing-url-bundle-ref',
      });

      // Contract: Should NOT call listTabsViaCDP
      expect(mockListTabs).not.toHaveBeenCalled();

      // Contract: Should still return summary+refId
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.refId).toBeDefined();

      // Contract: Summary should indicate skipped tabs
      expect(result.summary).toContain('skipped');
    });

    it('should use inputRefId for normalize stage', async () => {
      const inputRefId = 'provided-url-bundle-ref';

      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref',
        data: { inputCount: 3, outputCount: 3, duplicatesRemoved: 0 },
      });

      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref',
        data: { processedCount: 3, successCount: 3, failureCount: 0, dryRun: true },
      });

      await runPipelineTabsSkillize({ inputRefId });

      // Contract: Normalize should be called with the provided inputRefId
      expect(mockNormalize).toHaveBeenCalledWith(
        inputRefId,
        expect.any(Object)
      );
    });
  });

  describe('Contract C: confirmWrite=true enters approval flow', () => {
    it('should set dryRun=false when confirmWrite=true', async () => {
      mockListTabs.mockResolvedValue({
        success: true,
        data: { tabs: [{ url: 'https://example.com', title: 'Test' }], totalTabs: 1 },
      });

      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref',
        data: { inputCount: 1, outputCount: 1, duplicatesRemoved: 0 },
      });

      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref',
        data: { processedCount: 1, successCount: 1, failureCount: 0, dryRun: false },
      });

      const result = await runPipelineTabsSkillize({ confirmWrite: true });

      // Contract: Skillize should be called with confirmWrite=true
      expect(mockSkillize).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ confirmWrite: true })
      );

      // Contract: Summary should indicate WRITTEN (not dry-run)
      expect(result.summary).toContain('WRITTEN');
      expect(result.summary).not.toContain('DRY-RUN');
    });

    it('should default to confirmWrite=false (dry-run)', async () => {
      mockListTabs.mockResolvedValue({
        success: true,
        data: { tabs: [], totalTabs: 0 },
      });

      mockNormalize.mockResolvedValue({
        success: true,
        outputRefId: 'norm-ref',
        data: { inputCount: 0, outputCount: 0, duplicatesRemoved: 0 },
      });

      mockSkillize.mockResolvedValue({
        success: true,
        outputRefId: 'skill-ref',
        data: { processedCount: 0, successCount: 0, failureCount: 0, dryRun: true },
      });

      await runPipelineTabsSkillize({});

      // Contract: Default should be confirmWrite=false
      expect(mockSkillize).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ confirmWrite: false })
      );
    });
  });

  describe('Error handling contracts', () => {
    it('should return requireHuman=true when CDP connection fails', async () => {
      mockListTabs.mockResolvedValue({
        success: false,
        error: 'CDP connection refused',
      });

      const result = await runPipelineTabsSkillize({});

      // Contract: Failed CDP should require human intervention
      expect(result.success).toBe(false);
      expect(result.requireHuman).toBe(true);
      expect(result.humanInstruction).toBeDefined();
      expect(result.humanInstruction).toContain('Chrome');
    });

    it('should propagate error with context when normalize fails', async () => {
      mockListTabs.mockResolvedValue({
        success: true,
        data: { tabs: [], totalTabs: 0 },
      });

      mockNormalize.mockResolvedValue({
        success: false,
        error: 'Invalid URL format',
      });

      const result = await runPipelineTabsSkillize({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Normalize failed');
    });
  });
});
