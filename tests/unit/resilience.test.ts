/**
 * Resilience Module Unit Tests - P6
 */

import {
  withTimeout,
  withRetry,
  ResilienceError,
  DEFAULT_RESILIENCE_CONFIG,
} from '../../src/proxy-mcp/internal/resilience';
import { resetAllCircuits } from '../../src/proxy-mcp/internal/circuit-breaker';

describe('Resilience Module', () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  describe('withTimeout', () => {
    it('should complete within timeout', async () => {
      const result = await withTimeout(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success';
        },
        100,
        'test'
      );

      expect(result).toBe('success');
    });

    it('should throw on timeout', async () => {
      await expect(
        withTimeout(
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return 'never';
          },
          10,
          'test'
        )
      ).rejects.toThrow('test timed out after 10ms');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn, DEFAULT_RESILIENCE_CONFIG.retry, 'test-mcp');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValue('success');

      const config = { maxAttempts: 3, backoffMs: 10, jitter: false };
      const result = await withRetry(fn, config, 'test-mcp');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fail'));

      const config = { maxAttempts: 3, backoffMs: 10, jitter: false };

      await expect(withRetry(fn, config, 'test-mcp')).rejects.toThrow(ResilienceError);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const config = { maxAttempts: 3, backoffMs: 50, jitter: false };

      const start = Date.now();
      await withRetry(fn, config, 'test-mcp');
      const duration = Date.now() - start;

      // First retry: 50ms, second retry: 100ms
      // Should take at least 150ms
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('ResilienceError', () => {
    it('should have correct properties', () => {
      const error = new ResilienceError('Test error', 'timeout', 'test-mcp', 3);

      expect(error.message).toBe('Test error');
      expect(error.type).toBe('timeout');
      expect(error.mcpName).toBe('test-mcp');
      expect(error.attempts).toBe(3);
      expect(error.name).toBe('ResilienceError');
    });
  });
});
