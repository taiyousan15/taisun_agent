/**
 * Secrets Redaction - P11
 *
 * Masks sensitive data before it enters logs or memory.
 */

import { SECRET_PATTERNS, isAllowlisted, SecretPattern } from './patterns';

export interface RedactionResult {
  redacted: string;
  patternsMatched: string[];
  redactedCount: number;
}

/**
 * Redact secrets from a string
 *
 * @param input - The string to redact
 * @param options - Optional configuration
 * @returns Redaction result with the redacted string and metadata
 */
export function redactSecrets(
  input: string,
  options: { skipAllowlist?: boolean } = {}
): RedactionResult {
  if (!input || typeof input !== 'string') {
    return {
      redacted: input || '',
      patternsMatched: [],
      redactedCount: 0,
    };
  }

  // Check allowlist (skip redaction for test/example content)
  if (!options.skipAllowlist && isAllowlisted(input)) {
    return {
      redacted: input,
      patternsMatched: [],
      redactedCount: 0,
    };
  }

  let result = input;
  const patternsMatched: string[] = [];
  let redactedCount = 0;

  for (const secretPattern of SECRET_PATTERNS) {
    // Reset regex lastIndex for global patterns
    secretPattern.pattern.lastIndex = 0;

    // Count matches before replacing
    const matches = input.match(secretPattern.pattern);
    if (matches && matches.length > 0) {
      patternsMatched.push(secretPattern.name);
      redactedCount += matches.length;
      result = result.replace(secretPattern.pattern, secretPattern.replacement);
    }
  }

  return {
    redacted: result,
    patternsMatched,
    redactedCount,
  };
}

/**
 * Redact secrets from an object (deep)
 *
 * Recursively processes all string values in the object.
 */
export function redactObject<T>(obj: T, options: { skipAllowlist?: boolean } = {}): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSecrets(obj, options).redacted as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, options)) as T;
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      redacted[key] = redactObject(value, options);
    }
    return redacted as T;
  }

  return obj;
}

/**
 * Check if a string contains potential secrets
 *
 * Useful for pre-flight checks before storing/logging.
 */
export function containsSecrets(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Skip allowlisted content
  if (isAllowlisted(input)) {
    return false;
  }

  for (const secretPattern of SECRET_PATTERNS) {
    secretPattern.pattern.lastIndex = 0;
    if (secretPattern.pattern.test(input)) {
      return true;
    }
  }

  return false;
}

/**
 * Get pattern names that match in a string
 *
 * For diagnostics/logging (without exposing the secrets).
 */
export function detectSecretPatterns(input: string): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }

  const matched: string[] = [];

  for (const secretPattern of SECRET_PATTERNS) {
    secretPattern.pattern.lastIndex = 0;
    if (secretPattern.pattern.test(input)) {
      matched.push(secretPattern.name);
    }
  }

  return matched;
}
