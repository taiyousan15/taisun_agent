/**
 * Alerts Module - P14
 *
 * GitHub alert posting
 */

export { createGitHubAlertAPI, createMockGitHubAlertAPI, shouldPostAlert, postAlert } from './post';
export type { PostAlertOptions } from './post';
export type { AlertConfig, AlertPostResult, GitHubAlertAPI, MockGitHubAlertAPI } from './types';
export { DEFAULT_ALERT_CONFIG } from './types';
