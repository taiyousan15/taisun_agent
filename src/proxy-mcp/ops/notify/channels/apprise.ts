/**
 * Apprise Channel - P16
 *
 * Notification channel using Apprise (https://github.com/caronc/apprise).
 * Apprise supports 80+ notification services through a unified interface.
 */

import { NotificationPayload, NotificationChannel, SendResult } from '../types';
import { redact } from '../redact';

/**
 * Apprise channel configuration
 */
export interface AppriseConfig {
  /** Apprise server URL or direct service URL */
  url: string;
  /** Additional redaction patterns */
  redactPatterns?: string[];
}

/**
 * Format notification for Apprise
 */
function formatMessage(payload: NotificationPayload): { title: string; body: string } {
  const levelEmoji: Record<string, string> = {
    critical: '🚨',
    warn: '⚠️',
    recovery: '✅',
    info: 'ℹ️',
  };

  const emoji = levelEmoji[payload.level] || 'ℹ️';
  const title = `${emoji} ${payload.title}`;

  let body = payload.summary;

  if (payload.refId) {
    body += `\n\nRef: ${payload.refId}`;
  }

  if (payload.issueUrl) {
    body += `\nIssue: ${payload.issueUrl}`;
  }

  if (payload.timestamp) {
    body += `\nTime: ${payload.timestamp}`;
  }

  return { title, body };
}

/**
 * Create an Apprise notification channel
 */
export function createAppriseChannel(config: AppriseConfig): NotificationChannel {
  return {
    name: 'apprise',

    async send(payload: NotificationPayload): Promise<SendResult> {
      try {
        // Redact sensitive information
        const redactedPayload: NotificationPayload = {
          ...payload,
          title: redact(payload.title, { patterns: config.redactPatterns }),
          summary: redact(payload.summary, { patterns: config.redactPatterns }),
          refId: payload.refId ? redact(payload.refId, { patterns: config.redactPatterns }) : undefined,
          issueUrl: payload.issueUrl, // URLs are generally safe
        };

        const { title, body } = formatMessage(redactedPayload);

        // Determine notification type for Apprise
        const notifyType =
          payload.level === 'critical'
            ? 'failure'
            : payload.level === 'warn'
              ? 'warning'
              : payload.level === 'recovery'
                ? 'success'
                : 'info';

        // Check if URL is configured
        if (!config.url) {
          return {
            success: false,
            channel: 'apprise',
            error: 'Apprise URL not configured',
          };
        }

        // Apprise API call
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            body,
            type: notifyType,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          return {
            success: false,
            channel: 'apprise',
            error: `HTTP ${response.status}: ${redact(errorText)}`,
          };
        }

        return {
          success: true,
          channel: 'apprise',
        };
      } catch (error) {
        return {
          success: false,
          channel: 'apprise',
          error: error instanceof Error ? redact(error.message) : 'Unknown error',
        };
      }
    },
  };
}

/**
 * Create a mock Apprise channel for testing
 */
export function createMockAppriseChannel(
  onSend?: (payload: NotificationPayload) => void
): NotificationChannel {
  const sentPayloads: NotificationPayload[] = [];

  return {
    name: 'apprise-mock',

    async send(payload: NotificationPayload): Promise<SendResult> {
      sentPayloads.push(payload);
      onSend?.(payload);
      return {
        success: true,
        channel: 'apprise-mock',
      };
    },

    // For testing
    getSentPayloads: () => [...sentPayloads],
    clear: () => sentPayloads.length = 0,
  } as NotificationChannel & { getSentPayloads: () => NotificationPayload[]; clear: () => void };
}
