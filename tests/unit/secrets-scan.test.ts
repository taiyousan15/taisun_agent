/**
 * Secrets Scan Tests - P11
 *
 * Tests for repository secrets scanning functionality.
 */

import { SECRET_PATTERNS, isAllowlisted } from '../../src/proxy-mcp/security/patterns';

describe('Secrets Scan', () => {
  describe('Pattern Detection', () => {
    describe('GitHub tokens', () => {
      it('should detect ghp_ tokens', () => {
        const testLine = 'GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'github_token');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });

      it('should detect github_pat_ tokens', () => {
        // github_pat_ + 22 chars + _ + 59 chars
        const testLine = 'TOKEN=github_pat_11ABCDEFG0123456789012_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'github_fine_grained');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('AWS credentials', () => {
      it('should detect AWS access keys', () => {
        const testLine = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7ABCDEFG';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'aws_access_key');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('Slack tokens', () => {
      it('should detect xoxb- tokens', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'xoxb';
        const testLine = `SLACK_BOT_TOKEN=${prefix}-1234567890123-1234567890123-abcdefghijABCDEFGHIJ1234`;
        const pattern = SECRET_PATTERNS.find(p => p.name === 'slack_bot');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });

      it('should detect xoxp- tokens', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'xoxp';
        const testLine = `SLACK_USER_TOKEN=${prefix}-1234567890123-1234567890123-abcdefghijABCDEFGHIJ1234`;
        const pattern = SECRET_PATTERNS.find(p => p.name === 'slack_user');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('Notion tokens', () => {
      it('should detect secret_ tokens', () => {
        // secret_ + 43 chars - using obviously fake values (zeros)
        // Note: Using zeros to avoid GitHub push protection
        const testLine = 'NOTION_TOKEN=secret_0000000000000000000000000000000000000000000';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'notion_internal');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('Stripe tokens', () => {
      it('should detect sk_test_ tokens', () => {
        // Build token dynamically to avoid GitHub push protection
        const prefix = 'sk_test_';
        const testLine = `STRIPE_SECRET_KEY=${prefix}${'a'.repeat(26)}`;
        const pattern = SECRET_PATTERNS.find(p => p.name === 'stripe_secret');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('OpenAI tokens', () => {
      it('should detect sk- tokens', () => {
        // sk- + 48 chars
        const testLine = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'openai');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });

    describe('Google API keys', () => {
      it('should detect AIza tokens', () => {
        // AIza + 35 chars
        const testLine = 'GOOGLE_API_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456';
        const pattern = SECRET_PATTERNS.find(p => p.name === 'google_api');

        expect(pattern).toBeDefined();
        pattern!.pattern.lastIndex = 0;
        expect(pattern!.pattern.test(testLine)).toBe(true);
      });
    });
  });

  describe('Safe Content', () => {
    it('should not flag normal code', () => {
      const safelines = [
        'const foo = "bar";',
        'function getUser() { return user; }',
        'https://api.example.com/v1/users',
        '// This is a comment',
        'export class MyService {}',
      ];

      for (const line of safelines) {
        let matched = false;
        for (const pattern of SECRET_PATTERNS) {
          pattern.pattern.lastIndex = 0;
          if (pattern.pattern.test(line)) {
            matched = true;
            break;
          }
        }
        expect(matched).toBe(false);
      }
    });
  });

  describe('Allowlist', () => {
    it('should allowlist content with "example"', () => {
      expect(isAllowlisted('This is an example API key')).toBe(true);
    });

    it('should allowlist content with "dummy"', () => {
      expect(isAllowlisted('dummy_token_value')).toBe(true);
    });

    it('should allowlist content with "placeholder"', () => {
      expect(isAllowlisted('placeholder for token')).toBe(true);
    });

    it('should allowlist test fixture paths', () => {
      expect(isAllowlisted('tests/fixtures/secrets.json')).toBe(true);
    });

    it('should allowlist sk-xxxxxxxx placeholder patterns', () => {
      expect(isAllowlisted('Use sk-xxxxxxxx as placeholder')).toBe(true);
    });

    it('should NOT allowlist production content', () => {
      expect(isAllowlisted('production deployment config')).toBe(false);
    });

    it('should NOT allowlist real-looking secrets', () => {
      // This doesn't contain any allowlist keywords
      expect(isAllowlisted('AKIAIOSFODNN7ABCDEFG')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      let matched = false;
      for (const pattern of SECRET_PATTERNS) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test('')) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(false);
    });

    it('should handle special characters in content', () => {
      const content = '{"key": "value", "nested": {"deep": true}}';
      let matched = false;
      for (const pattern of SECRET_PATTERNS) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test(content)) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(false);
    });

    it('should not flag base64 that looks like secrets but is not', () => {
      // Base64 encoded normal data (not a secret)
      const base64Data = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64
      let matched = false;
      for (const pattern of SECRET_PATTERNS) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test(base64Data)) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(false);
    });
  });

  describe('Multiple Patterns in One Line', () => {
    it('should detect multiple tokens on same line', () => {
      const line = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 AKIAIOSFODNN7ABCDEFG';

      const matchedPatterns: string[] = [];
      for (const pattern of SECRET_PATTERNS) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test(line)) {
          matchedPatterns.push(pattern.name);
        }
      }

      expect(matchedPatterns).toContain('github_token');
      expect(matchedPatterns).toContain('aws_access_key');
    });
  });

  describe('Pattern Coverage', () => {
    it('should have patterns for major services', () => {
      const expectedPatterns = [
        'github_token',
        'aws_access_key',
        'slack_bot',
        'notion_internal',
        'stripe_secret',
        'openai',
        'google_api',
      ];

      const patternNames = SECRET_PATTERNS.map(p => p.name);
      for (const expected of expectedPatterns) {
        expect(patternNames).toContain(expected);
      }
    });

    it('should have at least 10 patterns defined', () => {
      expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(10);
    });
  });
});
