/**
 * Notification Types - P16
 *
 * Types for the notification system.
 */

/**
 * Notification level
 */
export type NotificationLevel = 'critical' | 'warn' | 'recovery' | 'info';

/**
 * Notification payload
 */
export interface NotificationPayload {
  /** Notification level */
  level: NotificationLevel;
  /** Title/subject */
  title: string;
  /** Summary/body */
  summary: string;
  /** Memory reference ID for tracking */
  refId?: string;
  /** Related GitHub issue URL */
  issueUrl?: string;
  /** Timestamp */
  timestamp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  enabled: boolean;
  url?: string;
  webhookUrl?: string;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  enabled: boolean;
  notifyOn: NotificationLevel[];
  channels: {
    apprise?: ChannelConfig;
    slack?: ChannelConfig;
    discord?: ChannelConfig;
  };
  cooldown: {
    criticalMinutes: number;
    warnMinutes: number;
    recoveryMinutes: number;
  };
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    allowCritical: boolean;
  };
  redaction: {
    patterns: string[];
    placeholder: string;
  };
}

/**
 * Send result
 */
export interface SendResult {
  success: boolean;
  channel: string;
  error?: string;
}

/**
 * Notification channel interface
 */
export interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<SendResult>;
}

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  notifyOn: ['critical', 'recovery'],
  channels: {
    apprise: { enabled: false },
    slack: { enabled: false },
    discord: { enabled: false },
  },
  cooldown: {
    criticalMinutes: 30,
    warnMinutes: 120,
    recoveryMinutes: 60,
  },
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
    allowCritical: true,
  },
  redaction: {
    patterns: [],
    placeholder: '[REDACTED]',
  },
};
