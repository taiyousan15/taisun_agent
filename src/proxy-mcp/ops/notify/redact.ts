/**
 * Redaction Module - P16
 *
 * Redacts sensitive information from notification payloads.
 * CRITICAL: No secrets should ever be exposed in notifications.
 */

/**
 * Built-in patterns for common secrets
 */
const BUILTIN_PATTERNS: RegExp[] = [
  // API keys and tokens (generic patterns)
  /(?:api[_-]?key|apikey|token|secret|password|passwd|pwd|auth)[=:]["']?[\w\-_.]{8,}["']?/gi,
  /(?:bearer|authorization)[:\s]+[\w\-_.]+/gi,

  // Specific service tokens
  /xox[baprs]-[\w\-]+/gi, // Slack tokens
  /ghp_[\w]+/gi, // GitHub personal access tokens
  /gho_[\w]+/gi, // GitHub OAuth tokens
  /ghu_[\w]+/gi, // GitHub user-to-server tokens
  /ghs_[\w]+/gi, // GitHub server-to-server tokens
  /github_pat_[\w]+/gi, // GitHub fine-grained PAT
  /sk-[\w\-]{20,}/gi, // OpenAI API keys
  /sk_live_[\w]+/gi, // Stripe live keys
  /sk_test_[\w]+/gi, // Stripe test keys
  /AKIA[\w]{16}/g, // AWS access key IDs
  /[\w/+=]{40}/g, // AWS secret access keys (base64-like, 40 chars)

  // Database connection strings
  /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
  /(?:user|username|password)=[^\s&]+/gi,

  // Private keys
  /-----BEGIN [\w\s]+ PRIVATE KEY-----[\s\S]*?-----END [\w\s]+ PRIVATE KEY-----/g,

  // Webhook URLs
  /https:\/\/hooks\.slack\.com\/[^\s]+/gi,
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s]+/gi,

  // Environment variable patterns
  /(?:APPRISE|SLACK|DISCORD|GITHUB|OPENAI|AWS|SENTRY|DATABASE)[_A-Z]*=\S+/gi,

  // DSN patterns (Sentry, etc.)
  /https:\/\/[\w]+@[\w.]+\.ingest\.sentry\.io\/[\d]+/gi,

  // IP addresses (private ranges can be sensitive)
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,

  // Email addresses (PII)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

/**
 * Redaction options
 */
export interface RedactOptions {
  /** Additional patterns to redact */
  patterns?: (string | RegExp)[];
  /** Replacement placeholder */
  placeholder?: string;
  /** Include built-in patterns */
  includeBuiltins?: boolean;
}

/**
 * Redact sensitive information from a string
 */
export function redact(input: string, options: RedactOptions = {}): string {
  const { patterns = [], placeholder = '[REDACTED]', includeBuiltins = true } = options;

  let result = input;

  // Apply built-in patterns
  if (includeBuiltins) {
    for (const pattern of BUILTIN_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      result = result.replace(pattern, placeholder);
    }
  }

  // Apply custom patterns
  for (const pattern of patterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;
    regex.lastIndex = 0;
    result = result.replace(regex, placeholder);
  }

  return result;
}

/**
 * Redact an object (deep)
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  options: RedactOptions = {}
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redact(value, options);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? redact(item, options)
          : typeof item === 'object' && item !== null
            ? redactObject(item as Record<string, unknown>, options)
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value as Record<string, unknown>, options);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Check if a string contains potential secrets
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

/**
 * Get the list of built-in patterns (for testing)
 */
export function getBuiltinPatterns(): RegExp[] {
  return [...BUILTIN_PATTERNS];
}
