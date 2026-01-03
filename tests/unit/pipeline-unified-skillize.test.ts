/**
 * Pipeline: web_skillize Unified Entrypoint Unit Tests - P8
 *
 * Tests for the unified pipeline entrypoint:
 * - mode='tabs': CDP tab collection
 * - mode='refId': existing URL bundle
 */

import {
  runUnifiedPipeline,
  validateUnifiedConfig,
  inferModeFromConfig,
  DEFAULT_UNIFIED_CONFIG,
} from '../../src/proxy-mcp/browser/pipeline-unified-skillize';
import * as pipelineTabsModule from '../../src/proxy-mcp/browser/pipeline-tabs-skillize';

// Mock dependencies
jest.mock('../../src/proxy-mcp/browser/pipeline-tabs-skillize');
jest.mock('../../src/proxy-mcp/observability', () => ({
  recordEvent: jest.fn(),
}));

const mockRunPipelineTabsSkillize = pipelineTabsModule.runPipelineTabsSkillize as jest.MockedFunction<
  typeof pipelineTabsModule.runPipelineTabsSkillize
>;

describe('Pipeline: web_skillize (Unified)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DEFAULT_UNIFIED_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_UNIFIED_CONFIG.maxUrls).toBe(200);
      expect(DEFAULT_UNIFIED_CONFIG.perDomainLimit).toBe(50);
      expect(DEFAULT_UNIFIED_CONFIG.stripTracking).toBe(true);
      expect(DEFAULT_UNIFIED_CONFIG.maxFetch).toBe(20);
      expect(DEFAULT_UNIFIED_CONFIG.confirmWrite).toBe(false);
      expect(DEFAULT_UNIFIED_CONFIG.namespace).toBe('long-term');
    });
  });

  describe('validateUnifiedConfig', () => {
    it('should require mode parameter', () => {
      const error = validateUnifiedConfig({});
      expect(error).toContain('mode is required');
    });

    it('should reject invalid mode values', () => {
      const error = validateUnifiedConfig({ mode: 'invalid' as 'tabs' });
      expect(error).toContain('Invalid mode');
    });

    it('should require inputRefId when mode=refId', () => {
      const error = validateUnifiedConfig({ mode: 'refId' });
      expect(error).toContain('inputRefId is required when mode="refId"');
    });

    it('should reject inputRefId when mode=tabs', () => {
      const error = validateUnifiedConfig({
        mode: 'tabs',
        inputRefId: 'some-ref',
      });
      expect(error).toContain('inputRefId should not be provided when mode="tabs"');
    });

    it('should accept valid tabs mode config', () => {
      const error = validateUnifiedConfig({ mode: 'tabs' });
      expect(error).toBeNull();
    });

    it('should accept valid refId mode config', () => {
      const error = validateUnifiedConfig({
        mode: 'refId',
        inputRefId: 'existing-bundle-ref',
      });
      expect(error).toBeNull();
    });
  });

  describe('inferModeFromConfig', () => {
    it('should return "tabs" when inputRefId is null', () => {
      expect(inferModeFromConfig(null)).toBe('tabs');
    });

    it('should return "tabs" when inputRefId is undefined', () => {
      expect(inferModeFromConfig(undefined)).toBe('tabs');
    });

    it('should return "refId" when inputRefId is provided', () => {
      expect(inferModeFromConfig('some-ref-id')).toBe('refId');
    });
  });

  describe('runUnifiedPipeline', () => {
    it('should reject missing mode parameter', async () => {
      const result = await runUnifiedPipeline({} as { mode: 'tabs' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('mode is required');
    });

    it('should run with mode=tabs', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-123',
        summary: 'Pipeline: web_skillize_from_tabs (DRY-RUN)\nDuration: 10s',
      });

      const result = await runUnifiedPipeline({ mode: 'tabs' });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('tabs');
      expect(result.refId).toBe('run-ref-123');
      expect(result.summary).toContain('mode=tabs');
      expect(mockRunPipelineTabsSkillize).toHaveBeenCalledWith(
        expect.objectContaining({ inputRefId: null })
      );
    });

    it('should run with mode=refId', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-456',
        summary: 'Pipeline: web_skillize_from_tabs (DRY-RUN)\nDuration: 5s',
      });

      const result = await runUnifiedPipeline({
        mode: 'refId',
        inputRefId: 'existing-bundle-ref',
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('refId');
      expect(result.refId).toBe('run-ref-456');
      expect(result.summary).toContain('mode=refId');
      expect(mockRunPipelineTabsSkillize).toHaveBeenCalledWith(
        expect.objectContaining({ inputRefId: 'existing-bundle-ref' })
      );
    });

    it('should pass domain filters to underlying pipeline', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-789',
        summary: 'Pipeline complete',
      });

      await runUnifiedPipeline({
        mode: 'tabs',
        includeDomains: ['docs.example.com'],
        excludeDomains: ['analytics.example.com'],
      });

      expect(mockRunPipelineTabsSkillize).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDomains: ['docs.example.com'],
          excludeDomains: ['analytics.example.com'],
        })
      );
    });

    it('should pass confirmWrite to underlying pipeline', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-write',
        summary: 'Pipeline complete (WRITTEN)',
      });

      await runUnifiedPipeline({
        mode: 'tabs',
        confirmWrite: true,
      });

      expect(mockRunPipelineTabsSkillize).toHaveBeenCalledWith(
        expect.objectContaining({ confirmWrite: true })
      );
    });

    it('should handle underlying pipeline failure', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: false,
        error: 'CDP connection failed',
      });

      const result = await runUnifiedPipeline({ mode: 'tabs' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP connection failed');
    });

    it('should handle require_human from underlying pipeline', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: false,
        error: 'CDP connection failed',
        requireHuman: true,
        humanInstruction: 'Please start Chrome with CDP',
      });

      const result = await runUnifiedPipeline({ mode: 'tabs' });

      expect(result.success).toBe(false);
      expect(result.requireHuman).toBe(true);
      expect(result.humanInstruction).toBe('Please start Chrome with CDP');
    });

    it('should replace pipeline name in summary with mode info', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-summary',
        summary: 'Pipeline: web_skillize_from_tabs (DRY-RUN)\nDuration: 10s',
      });

      const result = await runUnifiedPipeline({ mode: 'tabs' });

      expect(result.summary).toBe('Pipeline: web_skillize (mode=tabs) (DRY-RUN)\nDuration: 10s');
    });

    it('should pass maxFetch and rateLimitMs', async () => {
      mockRunPipelineTabsSkillize.mockResolvedValue({
        success: true,
        refId: 'run-ref-limits',
        summary: 'Pipeline complete',
      });

      await runUnifiedPipeline({
        mode: 'tabs',
        maxFetch: 10,
        rateLimitMs: 2000,
      });

      expect(mockRunPipelineTabsSkillize).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFetch: 10,
          rateLimitMs: 2000,
        })
      );
    });

    it('should reject mode=refId without inputRefId', async () => {
      const result = await runUnifiedPipeline({ mode: 'refId' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('inputRefId is required');
      expect(mockRunPipelineTabsSkillize).not.toHaveBeenCalled();
    });

    it('should reject mode=tabs with inputRefId', async () => {
      const result = await runUnifiedPipeline({
        mode: 'tabs',
        inputRefId: 'should-not-be-here',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('inputRefId should not be provided');
      expect(mockRunPipelineTabsSkillize).not.toHaveBeenCalled();
    });
  });
});
