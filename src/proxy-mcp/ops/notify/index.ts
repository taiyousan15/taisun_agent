/**
 * Notification Module - P16
 *
 * Notification system with redaction, cooldown, and quiet hours.
 */

export { NotificationSender, createNotificationSender } from './sender';
export { redact, redactObject, containsSecrets, getBuiltinPatterns } from './redact';
export { createAppriseChannel, createMockAppriseChannel } from './channels/apprise';

export type {
  NotificationPayload,
  NotificationConfig,
  NotificationChannel,
  NotificationLevel,
  SendResult,
  ChannelConfig,
} from './types';

export { DEFAULT_NOTIFICATION_CONFIG } from './types';
