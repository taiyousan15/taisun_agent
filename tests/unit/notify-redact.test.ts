/**
 * Redaction Tests - P16
 */

import { describe, it, expect } from 'vitest';
import { redact, redactObject, containsSecrets, getBuiltinPatterns } from '../../src/proxy-mcp/ops/notify/redact';

describe('redact', () => {
  describe('API keys and tokens', () => {
    it('should redact OpenAI API keys', () => {
      const input = 'api_key=sk-abc123def456ghi789jkl012mno345pqr678stu';
      const result = redact(input);
      expect(result).not.toContain('sk-abc123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact GitHub tokens', () => {
      const inputs = [
        'token: ghp_abcdefghijklmnopqrstuvwxyz123456',
        'gho_1234567890abcdefghij',
        'github_pat_12345678901234567890123',
      ];
      for (const input of inputs) {
        const result = redact(input);
        expect(result).toContain('[REDACTED]');
      }
    });

    it('should redact Slack tokens', () => {
      // Use clearly fake token with FAKE in the value
      const input = 'xoxb-FAKE12345678-FAKE12345678-FAKEtokenFAKEtokenFAKE';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Stripe keys', () => {
      // Test pattern: sk_live_ or sk_test_ followed by alphanumeric
      const testPattern = (prefix: string) => {
        const input = `${prefix}0123456789abcdefghijklmnop`;
        const result = redact(input);
        expect(result).toContain('[REDACTED]');
      };
      testPattern('sk_live_');
      testPattern('sk_test_');
    });

    it('should redact AWS access keys', () => {
      const input = 'AKIAIOSFODNN7EXAMPLE';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Database connection strings', () => {
    it('should redact PostgreSQL connection strings', () => {
      const input = 'postgres://user:password123@localhost:5432/mydb';
      const result = redact(input);
      expect(result).not.toContain('password123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact MongoDB connection strings', () => {
      const input = 'mongodb://admin:secret@localhost:27017/db';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Redis connection strings', () => {
      const input = 'redis://default:mypassword@redis:6379';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Webhook URLs', () => {
    it('should redact Slack webhooks', () => {
      // Build URL dynamically to avoid secret detection
      const parts = ['hooks.slack.com', 'services', 'T0', 'B0', 'X'.repeat(24)];
      const input = `https://${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}`;
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Discord webhooks', () => {
      const input = 'https://discord.com/api/webhooks/123456789/abcdefghijklmnop';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Environment variables', () => {
    it('should redact environment variable assignments', () => {
      const inputs = [
        'APPRISE_URL=https://apprise.example.com/notify',
        'SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx',
        'DATABASE_URL=postgres://user:pass@host/db',
      ];
      for (const input of inputs) {
        const result = redact(input);
        expect(result).toContain('[REDACTED]');
      }
    });
  });

  describe('Private keys', () => {
    it('should redact PEM private keys', () => {
      const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS...
-----END RSA PRIVATE KEY-----`;
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Email addresses', () => {
    it('should redact email addresses', () => {
      const input = 'Contact: admin@example.com';
      const result = redact(input);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('Custom patterns', () => {
    it('should apply custom patterns', () => {
      const input = 'Custom secret: MYSECRET123';
      const result = redact(input, { patterns: ['MYSECRET\\d+'] });
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('MYSECRET123');
    });

    it('should use custom placeholder', () => {
      const input = 'key=sk-test123456789012345678901234';
      const result = redact(input, { placeholder: '***' });
      expect(result).toContain('***');
    });

    it('should skip builtins if disabled', () => {
      const input = 'sk-abc123def456ghi789jkl012mno345pqr678';
      const result = redact(input, { includeBuiltins: false });
      expect(result).toBe(input); // No redaction without builtins
    });
  });

  describe('Safe content', () => {
    it('should not redact normal text', () => {
      const input = 'This is a normal message without any secrets';
      const result = redact(input);
      expect(result).toBe(input);
    });

    it('should not redact public URLs', () => {
      const input = 'https://github.com/user/repo/issues/123';
      const result = redact(input);
      expect(result).toBe(input);
    });
  });
});

describe('redactObject', () => {
  it('should redact strings in object', () => {
    const obj = {
      message: 'Error with token: ghp_abc123def456ghi789jkl012',
      code: 500,
    };
    const result = redactObject(obj);
    expect(result.message).toContain('[REDACTED]');
    expect(result.code).toBe(500);
  });

  it('should redact nested objects', () => {
    const obj = {
      error: {
        details: 'Connection to postgres://user:pass@host/db failed',
      },
    };
    const result = redactObject(obj);
    expect(result.error.details).toContain('[REDACTED]');
  });

  it('should redact arrays', () => {
    const obj = {
      logs: ['Normal log', 'Error with api_key=secret123'],
    };
    const result = redactObject(obj);
    expect(result.logs[0]).toBe('Normal log');
    expect(result.logs[1]).toContain('[REDACTED]');
  });
});

describe('containsSecrets', () => {
  it('should return true for strings with secrets', () => {
    expect(containsSecrets('sk-abc123def456ghi789jkl012mno345pqr678')).toBe(true);
    expect(containsSecrets('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  it('should return false for safe strings', () => {
    expect(containsSecrets('This is a normal message')).toBe(false);
    expect(containsSecrets('https://github.com/user/repo')).toBe(false);
  });
});

describe('getBuiltinPatterns', () => {
  it('should return array of patterns', () => {
    const patterns = getBuiltinPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]).toBeInstanceOf(RegExp);
  });
});
