/**
 * i18n - Internationalization system for TAISUN
 *
 * Default locale is Japanese (ja).
 * Set TAISUN_LOCALE=en for English.
 */

import { ja } from './messages/ja';
import { en } from './messages/en';

type MessageKey = keyof typeof ja;
type Locale = 'ja' | 'en';

const messages: Record<Locale, Record<string, string>> = {
  ja,
  en,
};

/**
 * Get current locale from environment
 * Default: ja (Japanese)
 */
export function getLocale(): Locale {
  const locale = process.env.TAISUN_LOCALE?.toLowerCase();
  if (locale === 'en') {
    return 'en';
  }
  return 'ja'; // Default to Japanese
}

/**
 * Translate a message key with optional parameters
 *
 * @param key - Message key (e.g., 'issue.runlog.created')
 * @param params - Optional parameters to interpolate (e.g., { runId: '123' })
 * @returns Translated message
 *
 * @example
 * t('issue.runlog.created', { runId: 'abc123', input: 'Fix bug' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale();
  const catalog = messages[locale];

  let message = catalog[key];
  if (!message) {
    // Fallback to Japanese if key not found
    message = messages.ja[key];
  }
  if (!message) {
    // Return key if no translation found
    return key;
  }

  // Interpolate parameters
  if (params) {
    for (const [paramKey, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    }
  }

  return message;
}

/**
 * Check if a message key exists
 */
export function hasKey(key: string): boolean {
  const locale = getLocale();
  return key in messages[locale] || key in messages.ja;
}

/**
 * Get all available message keys
 */
export function getKeys(): string[] {
  return Object.keys(messages.ja);
}
