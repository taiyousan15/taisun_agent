/**
 * Security Patterns - P11
 *
 * Secret detection patterns for redaction.
 * Conservative approach: focus on well-known formats to avoid false positives.
 */

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Secret detection patterns
 *
 * Note: These patterns are conservative to minimize false positives.
 * They focus on well-known token formats with clear prefixes.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // GitHub tokens
  {
    name: 'github_token',
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    replacement: '[REDACTED:GITHUB_PAT]',
  },
  {
    name: 'github_fine_grained',
    pattern: /\b(github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/g,
    replacement: '[REDACTED:GITHUB_FINE_GRAINED]',
  },
  {
    name: 'github_oauth',
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    replacement: '[REDACTED:GITHUB_OAUTH]',
  },
  {
    name: 'github_app',
    pattern: /\b(ghu_[a-zA-Z0-9]{36})\b/g,
    replacement: '[REDACTED:GITHUB_APP]',
  },

  // AWS (access keys are AKIA + 16 alphanumeric = 20 total)
  {
    name: 'aws_access_key',
    pattern: /\b(AKIA[A-Z0-9]{16})\b/g,
    replacement: '[REDACTED:AWS_ACCESS_KEY]',
  },

  // Slack
  {
    name: 'slack_bot',
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    replacement: '[REDACTED:SLACK_BOT]',
  },
  {
    name: 'slack_user',
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,64})\b/g,
    replacement: '[REDACTED:SLACK_USER]',
  },

  // Notion
  {
    name: 'notion_internal',
    pattern: /\b(secret_[a-zA-Z0-9]{43})\b/g,
    replacement: '[REDACTED:NOTION_INTERNAL]',
  },
  {
    name: 'notion_api',
    pattern: /\b(ntn_[a-zA-Z0-9]{40,})\b/g,
    replacement: '[REDACTED:NOTION_API]',
  },

  // Stripe (live and test keys)
  {
    name: 'stripe_secret',
    pattern: /\b(sk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    replacement: '[REDACTED:STRIPE_SECRET]',
  },
  {
    name: 'stripe_restricted',
    pattern: /\b(rk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    replacement: '[REDACTED:STRIPE_RESTRICTED]',
  },

  // OpenAI (conservative - only clear formats)
  {
    name: 'openai',
    pattern: /\b(sk-[a-zA-Z0-9]{48})\b/g,
    replacement: '[REDACTED:OPENAI]',
  },
  {
    name: 'openai_project',
    pattern: /\b(sk-proj-[a-zA-Z0-9]{48,})\b/g,
    replacement: '[REDACTED:OPENAI_PROJECT]',
  },

  // Anthropic
  {
    name: 'anthropic',
    pattern: /\b(sk-ant-[a-zA-Z0-9-]{93,})\b/g,
    replacement: '[REDACTED:ANTHROPIC]',
  },

  // Google
  {
    name: 'google_api',
    pattern: /\b(AIza[0-9A-Za-z-_]{35})\b/g,
    replacement: '[REDACTED:GOOGLE_API]',
  },

  // SendGrid
  {
    name: 'sendgrid',
    pattern: /\b(SG\.[a-zA-Z0-9-_]{22}\.[a-zA-Z0-9-_]{43})\b/g,
    replacement: '[REDACTED:SENDGRID]',
  },

  // Twilio
  {
    name: 'twilio_sid',
    pattern: /\b(AC[a-f0-9]{32})\b/g,
    replacement: '[REDACTED:TWILIO_SID]',
  },
  {
    name: 'twilio_auth',
    pattern: /\b(SK[a-f0-9]{32})\b/g,
    replacement: '[REDACTED:TWILIO_AUTH]',
  },

  // Firebase
  {
    name: 'firebase',
    pattern: /\b(AAAA[a-zA-Z0-9_-]{100,})\b/g,
    replacement: '[REDACTED:FIREBASE]',
  },

  // Generic high-entropy secrets (32+ chars, mixed case + numbers)
  // Only match when it looks like a key/token context
  {
    name: 'generic_key',
    pattern: /["']?(?:api_?key|secret|token|password|credential|auth)["']?\s*[:=]\s*["']([a-zA-Z0-9+/=_-]{32,})["']/gi,
    replacement: '[REDACTED:SECRET]',
  },
];

/**
 * Allowlist patterns - content matching these is NOT redacted
 *
 * Used for:
 * - Example/dummy values in docs
 * - Fixture data for tests
 * - Placeholder values
 */
export const ALLOWLIST_PATTERNS: RegExp[] = [
  // Common example/dummy patterns
  /example/i,
  /dummy/i,
  /placeholder/i,
  /test[_-]?key/i,
  /fake[_-]?key/i,
  /sample/i,
  /xxx+/i,
  /your[_-]?api[_-]?key/i,
  /insert[_-]?here/i,

  // Fixture paths
  /tests?\/fixtures?/i,

  // Documentation patterns
  /sk-xxxxxxxx/i,
  /ghp_xxxx/i,
];

/**
 * Check if content should be excluded from redaction
 */
export function isAllowlisted(content: string): boolean {
  return ALLOWLIST_PATTERNS.some((pattern) => pattern.test(content));
}
