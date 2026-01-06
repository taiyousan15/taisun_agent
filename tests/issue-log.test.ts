/**
 * Issue Logging Tests
 *
 * Tests for GitHub Issue logging functionality with i18n support
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock child_process before importing
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

import { execSync } from 'child_process';
import {
  checkGitHubEnv,
  requireGitHubEnv,
  GitHubEnvError,
  hasGitHubToken,
  isGhCliAvailable,
  getRepoFromGit,
  formatCheckResult,
} from '../src/utils/env-check';
import { t, getLocale } from '../src/i18n';

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Environment Check', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('hasGitHubToken', () => {
    it('should return false when GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      expect(hasGitHubToken()).toBe(false);
    });

    it('should return false when GITHUB_TOKEN is a placeholder', () => {
      process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxx';
      expect(hasGitHubToken()).toBe(false);
    });

    it('should return true when GITHUB_TOKEN is set', () => {
      process.env.GITHUB_TOKEN = 'ghp_validtoken123456789';
      expect(hasGitHubToken()).toBe(true);
    });
  });

  describe('isGhCliAvailable', () => {
    it('should return true when gh CLI is available', () => {
      mockedExecSync.mockReturnValue(Buffer.from('gh version 2.40.0'));
      expect(isGhCliAvailable()).toBe(true);
    });

    it('should return false when gh CLI is not available', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('command not found: gh');
      });
      expect(isGhCliAvailable()).toBe(false);
    });
  });

  describe('getRepoFromGit', () => {
    it('should parse HTTPS URL', () => {
      mockedExecSync.mockReturnValue('https://github.com/owner/repo.git\n');
      expect(getRepoFromGit()).toBe('owner/repo');
    });

    it('should parse SSH URL', () => {
      mockedExecSync.mockReturnValue('git@github.com:owner/repo.git\n');
      expect(getRepoFromGit()).toBe('owner/repo');
    });

    it('should return null when not a git repo', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });
      expect(getRepoFromGit()).toBe(null);
    });
  });

  describe('checkGitHubEnv', () => {
    it('should return errors when token is missing', () => {
      delete process.env.GITHUB_TOKEN;
      mockedExecSync.mockReturnValue('gh version 2.40.0');

      const result = checkGitHubEnv();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.key === 'GITHUB_TOKEN')).toBe(true);
    });

    it('should return valid when all requirements met', () => {
      process.env.GITHUB_TOKEN = 'ghp_validtoken123456789';
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh --version')) {
          return Buffer.from('gh version 2.40.0');
        }
        if (cmd.includes('gh auth status')) {
          return Buffer.from('Logged in');
        }
        if (cmd.includes('git remote')) {
          return 'https://github.com/owner/repo.git\n';
        }
        return Buffer.from('');
      });

      const result = checkGitHubEnv();
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('requireGitHubEnv', () => {
    it('should throw GitHubEnvError when token is missing', () => {
      delete process.env.GITHUB_TOKEN;
      mockedExecSync.mockReturnValue('gh version 2.40.0');

      expect(() => requireGitHubEnv()).toThrow(GitHubEnvError);
    });

    it('should not throw when all requirements met', () => {
      process.env.GITHUB_TOKEN = 'ghp_validtoken123456789';
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('gh --version')) {
          return Buffer.from('gh version 2.40.0');
        }
        if (cmd.includes('gh auth status')) {
          return Buffer.from('Logged in');
        }
        if (cmd.includes('git remote')) {
          return 'https://github.com/owner/repo.git\n';
        }
        return Buffer.from('');
      });

      expect(() => requireGitHubEnv()).not.toThrow();
    });
  });
});

describe('i18n', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLocale', () => {
    it('should return ja by default', () => {
      delete process.env.TAISUN_LOCALE;
      expect(getLocale()).toBe('ja');
    });

    it('should return en when TAISUN_LOCALE=en', () => {
      process.env.TAISUN_LOCALE = 'en';
      // Need to re-import to pick up new env
      const { getLocale: getLocaleNew } = require('../src/i18n');
      expect(getLocaleNew()).toBe('en');
    });
  });

  describe('t (translation)', () => {
    it('should return Japanese message by default', () => {
      delete process.env.TAISUN_LOCALE;
      const message = t('env.check.success');
      expect(message).toContain('すべての環境設定が正常です');
    });

    it('should interpolate parameters', () => {
      const message = t('doctor.result.ok', { item: 'GITHUB_TOKEN' });
      expect(message).toContain('GITHUB_TOKEN');
    });

    it('should return key if translation not found', () => {
      const message = t('nonexistent.key');
      expect(message).toBe('nonexistent.key');
    });
  });
});

describe('formatCheckResult', () => {
  it('should format successful result', () => {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
    };
    const formatted = formatCheckResult(result);
    expect(formatted).toContain('✅');
  });

  it('should format failed result with errors', () => {
    const result = {
      valid: false,
      errors: [{ key: 'GITHUB_TOKEN', message: 'Not set' }],
      warnings: [],
    };
    const formatted = formatCheckResult(result);
    expect(formatted).toContain('❌');
    expect(formatted).toContain('GITHUB_TOKEN');
  });
});
