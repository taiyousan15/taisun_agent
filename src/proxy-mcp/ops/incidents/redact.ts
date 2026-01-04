/**
 * Incident Redaction Utilities - P17
 *
 * Simple redaction for incident summaries.
 * Note: When P16 notify/redact is merged, this can be replaced with imports from there.
 */

/**
 * Built-in patterns for sensitive data
 */
const BUILTIN_PATTERNS: RegExp[] = [
  // OpenAI API keys
  /sk-[a-zA-Z0-9]{20,}/g,
  // GitHub tokens
  /gh[ps]_[a-zA-Z0-9]{30,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  // Slack tokens
  /xox[baprs]-[a-zA-Z0-9-]+/g,
  // Stripe keys
  /sk_(?:live|test)_[a-zA-Z0-9]+/g,
  // AWS access keys
  /AKIA[0-9A-Z]{16}/g,
  // Database URLs with passwords
  /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g,
  // Generic API keys in URLs or assignments
  /(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*['"]?[a-zA-Z0-9_\-./+=]{8,}['"]?/gi,
  // Webhook URLs (Slack, Discord)
  /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/g,
  /https:\/\/discord\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g,
  // PEM private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

/**
 * Redaction options
 */
export interface RedactOptions {
  patterns?: string[];
  placeholder?: string;
  includeBuiltins?: boolean;
}

/**
 * Redact sensitive data from a string
 */
export function redact(input: string, options: RedactOptions = {}): string {
  const {
    patterns = [],
    placeholder = '[REDACTED]',
    includeBuiltins = true,
  } = options;

  let result = input;

  // Apply builtin patterns
  if (includeBuiltins) {
    for (const pattern of BUILTIN_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      result = result.replace(pattern, placeholder);
    }
  }

  // Apply custom patterns
  for (const patternStr of patterns) {
    try {
      const pattern = new RegExp(patternStr, 'g');
      result = result.replace(pattern, placeholder);
    } catch {
      // Skip invalid patterns
    }
  }

  return result;
}

/**
 * Check if a string contains sensitive data
 */
export function containsSecrets(input: string): boolean {
  for (const pattern of BUILTIN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}
