/**
 * Security Redaction Tests - P11
 *
 * Tests for secrets redaction functionality.
 */

import {
  redactSecrets,
  redactObject,
  containsSecrets,
  detectSecretPatterns,
  isAllowlisted,
} from '../../src/proxy-mcp/security';

describe('Security Redaction', () => {
  describe('redactSecrets', () => {
    describe('GitHub tokens', () => {
      it('should redact GitHub PAT (ghp_)', () => {
        const input = 'Token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('Token: [REDACTED:GITHUB_PAT]');
        expect(result.patternsMatched).toContain('github_token');
        expect(result.redactedCount).toBe(1);
      });

      it('should redact GitHub fine-grained token', () => {
        // github_pat_ + 22 chars + _ + 59 chars
        const input = 'github_pat_11ABCDEFG0123456789012_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456';
        const result = redactSecrets(input);

        expect(result.redacted).toContain('[REDACTED:GITHUB_FINE_GRAINED]');
        expect(result.patternsMatched).toContain('github_fine_grained');
      });

      it('should redact GitHub OAuth token (gho_)', () => {
        const input = 'gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:GITHUB_OAUTH]');
      });
    });

    describe('AWS credentials', () => {
      it('should redact AWS access key', () => {
        // Note: Don't use 'EXAMPLE' as it triggers allowlist
        const input = 'AKIAIOSFODNN7ABCDEFG';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:AWS_ACCESS_KEY]');
        expect(result.patternsMatched).toContain('aws_access_key');
      });
    });

    describe('Slack tokens', () => {
      it('should redact Slack bot token', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'xoxb';
        const input = `${prefix}-1234567890123-1234567890123-abcdefghijABCDEFGHIJ1234`;
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:SLACK_BOT]');
        expect(result.patternsMatched).toContain('slack_bot');
      });

      it('should redact Slack user token', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'xoxp';
        const input = `${prefix}-1234567890123-1234567890123-abcdefghijABCDEFGHIJ1234`;
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:SLACK_USER]');
      });
    });

    describe('Notion tokens', () => {
      it('should redact Notion internal token', () => {
        // secret_ + 43 chars - using obviously fake values (zeros)
        // Note: Using zeros to avoid GitHub push protection
        const input = 'secret_0000000000000000000000000000000000000000000';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:NOTION_INTERNAL]');
        expect(result.patternsMatched).toContain('notion_internal');
      });
    });

    describe('OpenAI tokens', () => {
      it('should redact OpenAI API key', () => {
        // OpenAI keys are sk- followed by 48 alphanumeric characters
        // 26 lowercase + 22 uppercase = 48
        const input = 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:OPENAI]');
        expect(result.patternsMatched).toContain('openai');
      });

      it('should redact OpenAI project key', () => {
        const input = 'sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:OPENAI_PROJECT]');
      });
    });

    describe('Anthropic tokens', () => {
      it('should redact Anthropic API key', () => {
        // Anthropic keys are 93+ characters after sk-ant-
        const input = 'sk-ant-' + 'a'.repeat(93);
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:ANTHROPIC]');
        expect(result.patternsMatched).toContain('anthropic');
      });
    });

    describe('Stripe tokens', () => {
      it('should redact Stripe secret key', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'sk_test_';
        const input = `${prefix}${'a'.repeat(26)}`;
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:STRIPE_SECRET]');
        expect(result.patternsMatched).toContain('stripe_secret');
      });
    });

    describe('Google API keys', () => {
      it('should redact Google API key', () => {
        // Google API keys are AIza followed by 35 characters
        // 2 (Sy) + 26 (A-Z) + 7 (0-6) = 35
        const input = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456';
        const result = redactSecrets(input);

        expect(result.redacted).toBe('[REDACTED:GOOGLE_API]');
        expect(result.patternsMatched).toContain('google_api');
      });
    });

    describe('Generic secrets', () => {
      it('should redact api_key assignment patterns', () => {
        const input = 'api_key: "abcdefghijklmnopqrstuvwxyz123456"';
        const result = redactSecrets(input);

        expect(result.redacted).toContain('[REDACTED:SECRET]');
      });

      it('should redact secret assignment patterns', () => {
        const input = 'secret = "abcdefghijklmnopqrstuvwxyz123456"';
        const result = redactSecrets(input);

        expect(result.redacted).toContain('[REDACTED:SECRET]');
      });
    });

    describe('Multiple secrets', () => {
      it('should redact multiple secrets in one string', () => {
        const input = `
          GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
          AWS_KEY=AKIAIOSFODNN7ABCDEFG
        `;
        const result = redactSecrets(input);

        expect(result.redacted).toContain('[REDACTED:GITHUB_PAT]');
        expect(result.redacted).toContain('[REDACTED:AWS_ACCESS_KEY]');
        expect(result.redactedCount).toBe(2);
      });
    });

    describe('Safe content', () => {
      it('should not redact normal text', () => {
        const input = 'Hello, this is a normal message without secrets.';
        const result = redactSecrets(input);

        expect(result.redacted).toBe(input);
        expect(result.redactedCount).toBe(0);
      });

      it('should not redact URLs', () => {
        const input = 'https://api.example.com/v1/users';
        const result = redactSecrets(input);

        expect(result.redacted).toBe(input);
        expect(result.redactedCount).toBe(0);
      });
    });
  });

  describe('isAllowlisted', () => {
    it('should allowlist example content', () => {
      expect(isAllowlisted('This is an example API key')).toBe(true);
    });

    it('should allowlist dummy values', () => {
      expect(isAllowlisted('dummy_token_here')).toBe(true);
    });

    it('should allowlist test fixtures', () => {
      expect(isAllowlisted('tests/fixtures/secrets.json')).toBe(true);
    });

    it('should allowlist placeholder patterns', () => {
      expect(isAllowlisted('sk-xxxxxxxx')).toBe(true);
      expect(isAllowlisted('ghp_xxxx')).toBe(true);
    });

    it('should not allowlist real-looking content', () => {
      expect(isAllowlisted('production deployment config')).toBe(false);
    });
  });

  describe('redactSecrets with allowlist', () => {
    it('should skip redaction for allowlisted content', () => {
      const input = 'example: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
      const result = redactSecrets(input);

      // Should not redact because 'example' is in allowlist
      expect(result.redacted).toBe(input);
      expect(result.redactedCount).toBe(0);
    });

    it('should redact when skipAllowlist is true', () => {
      const input = 'example: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
      const result = redactSecrets(input, { skipAllowlist: true });

      expect(result.redacted).toContain('[REDACTED:GITHUB_PAT]');
      expect(result.redactedCount).toBe(1);
    });
  });

  describe('redactObject', () => {
    it('should redact secrets in nested objects', () => {
      const obj = {
        name: 'Test',
        config: {
          token: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
          nested: {
            key: 'AKIAIOSFODNN7ABCDEFG',
          },
        },
      };

      const result = redactObject(obj);

      expect(result.config.token).toBe('[REDACTED:GITHUB_PAT]');
      expect(result.config.nested.key).toBe('[REDACTED:AWS_ACCESS_KEY]');
      expect(result.name).toBe('Test');
    });

    it('should redact secrets in arrays', () => {
      const arr = [
        'normal text',
        'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
        { token: 'AKIAIOSFODNN7ABCDEFG' },
      ];

      const result = redactObject(arr);

      expect(result[0]).toBe('normal text');
      expect(result[1]).toBe('[REDACTED:GITHUB_PAT]');
      expect((result[2] as { token: string }).token).toBe('[REDACTED:AWS_ACCESS_KEY]');
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });

    it('should handle non-string primitives', () => {
      expect(redactObject(123)).toBe(123);
      expect(redactObject(true)).toBe(true);
    });
  });

  describe('containsSecrets', () => {
    it('should return true for strings with secrets', () => {
      expect(containsSecrets('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789')).toBe(true);
      expect(containsSecrets('AKIAIOSFODNN7ABCDEFG')).toBe(true);
    });

    it('should return false for safe strings', () => {
      expect(containsSecrets('Hello world')).toBe(false);
      expect(containsSecrets('https://example.com')).toBe(false);
    });

    it('should return false for allowlisted content', () => {
      expect(containsSecrets('example ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789')).toBe(false);
    });

    it('should handle empty and null input', () => {
      expect(containsSecrets('')).toBe(false);
      expect(containsSecrets(null as unknown as string)).toBe(false);
    });
  });

  describe('detectSecretPatterns', () => {
    it('should return pattern names for detected secrets', () => {
      const input = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 and AKIAIOSFODNN7ABCDEFG';
      const patterns = detectSecretPatterns(input);

      expect(patterns).toContain('github_token');
      expect(patterns).toContain('aws_access_key');
    });

    it('should return empty array for safe content', () => {
      expect(detectSecretPatterns('Hello world')).toEqual([]);
    });

    it('should handle empty input', () => {
      expect(detectSecretPatterns('')).toEqual([]);
    });
  });
});
