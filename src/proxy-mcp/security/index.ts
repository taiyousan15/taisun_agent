/**
 * Security Module - P11
 *
 * Secrets redaction and security utilities.
 */

export {
  redactSecrets,
  redactObject,
  containsSecrets,
  detectSecretPatterns,
  type RedactionResult,
} from './redact';

export {
  SECRET_PATTERNS,
  ALLOWLIST_PATTERNS,
  isAllowlisted,
  type SecretPattern,
} from './patterns';
