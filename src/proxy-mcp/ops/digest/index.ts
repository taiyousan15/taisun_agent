/**
 * Digest Module - P17
 *
 * Weekly improvement digest generation
 */

// Types
export type {
  DigestConfig,
  WeeklyDigest,
  TopCause,
  RecommendedAction,
  DigestGenerationResult,
} from './types';
export { DEFAULT_DIGEST_CONFIG } from './types';

// Generation
export {
  generateWeeklyDigest,
  digestToMarkdown,
  isDigestDay,
} from './generate';
