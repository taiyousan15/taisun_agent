/**
 * Notification Sender - P16
 *
 * Sends notifications through configured channels with:
 * - Redaction of sensitive information
 * - Quiet hours support
 * - Cooldown tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  NotificationPayload,
  NotificationConfig,
  NotificationChannel,
  SendResult,
  NotificationLevel,
  DEFAULT_NOTIFICATION_CONFIG,
} from './types';
import { redact, redactObject } from './redact';
import { createAppriseChannel, createMockAppriseChannel } from './channels/apprise';

/**
 * Cooldown state
 */
interface CooldownState {
  lastNotified: Record<NotificationLevel, number>;
}

/**
 * Notification sender options
 */
export interface NotificationSenderOptions {
  /** Configuration */
  config?: NotificationConfig;
  /** Config file path */
  configPath?: string;
  /** State file path for cooldown persistence */
  statePath?: string;
  /** Use mock channels for testing */
  mock?: boolean;
  /** Mock send callback */
  onMockSend?: (payload: NotificationPayload) => void;
}

/**
 * Notification Sender
 */
export class NotificationSender {
  private config: NotificationConfig;
  private channels: NotificationChannel[] = [];
  private cooldownState: CooldownState = {
    lastNotified: {
      critical: 0,
      warn: 0,
      recovery: 0,
      info: 0,
    },
  };
  private statePath?: string;
  private mock: boolean;
  private onMockSend?: (payload: NotificationPayload) => void;

  constructor(options: NotificationSenderOptions = {}) {
    this.mock = options.mock ?? false;
    this.onMockSend = options.onMockSend;
    this.statePath = options.statePath;

    // Load configuration
    if (options.config) {
      this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...options.config };
    } else if (options.configPath && fs.existsSync(options.configPath)) {
      const configData = JSON.parse(fs.readFileSync(options.configPath, 'utf-8'));
      this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...configData };
    } else {
      this.config = DEFAULT_NOTIFICATION_CONFIG;
    }

    // Load cooldown state
    if (this.statePath && fs.existsSync(this.statePath)) {
      try {
        const stateData = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
        if (stateData.cooldown) {
          this.cooldownState = stateData.cooldown;
        }
      } catch {
        // Ignore state load errors
      }
    }

    // Initialize channels
    this.initializeChannels();
  }

  /**
   * Initialize notification channels
   */
  private initializeChannels(): void {
    this.channels = [];

    if (this.mock) {
      this.channels.push(createMockAppriseChannel(this.onMockSend));
      return;
    }

    // Apprise channel
    if (this.config.channels.apprise?.enabled) {
      const url = this.resolveEnvVar(this.config.channels.apprise.url);
      if (url) {
        this.channels.push(
          createAppriseChannel({
            url,
            redactPatterns: this.config.redaction.patterns,
          })
        );
      }
    }

    // Add more channels here as needed (slack, discord, etc.)
  }

  /**
   * Resolve environment variable references
   */
  private resolveEnvVar(value?: string): string | undefined {
    if (!value) return undefined;

    // Handle ${VAR_NAME} pattern
    const match = value.match(/^\$\{(\w+)\}$/);
    if (match) {
      return process.env[match[1]];
    }

    // Handle $VAR_NAME pattern
    if (value.startsWith('$')) {
      return process.env[value.slice(1)];
    }

    return value;
  }

  /**
   * Check if notification should be sent (quiet hours)
   */
  private isQuietHours(): boolean {
    if (!this.config.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const hour = now.getHours();
    const { startHour, endHour } = this.config.quietHours;

    // Handle overnight range (e.g., 22:00 - 07:00)
    if (startHour > endHour) {
      return hour >= startHour || hour < endHour;
    }

    return hour >= startHour && hour < endHour;
  }

  /**
   * Check if notification is in cooldown
   */
  private isInCooldown(level: NotificationLevel): boolean {
    const lastNotified = this.cooldownState.lastNotified[level] || 0;
    const cooldownMs = this.getCooldownMs(level);
    return Date.now() - lastNotified < cooldownMs;
  }

  /**
   * Get cooldown duration in milliseconds
   */
  private getCooldownMs(level: NotificationLevel): number {
    switch (level) {
      case 'critical':
        return this.config.cooldown.criticalMinutes * 60 * 1000;
      case 'warn':
        return this.config.cooldown.warnMinutes * 60 * 1000;
      case 'recovery':
        return this.config.cooldown.recoveryMinutes * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Update cooldown state
   */
  private updateCooldown(level: NotificationLevel): void {
    this.cooldownState.lastNotified[level] = Date.now();
    this.saveCooldownState();
  }

  /**
   * Save cooldown state to file
   */
  private saveCooldownState(): void {
    if (!this.statePath) return;

    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let state: Record<string, unknown> = {};
      if (fs.existsSync(this.statePath)) {
        state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      }

      state.cooldown = this.cooldownState;
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    } catch {
      // Ignore state save errors
    }
  }

  /**
   * Send a notification
   */
  async send(payload: NotificationPayload): Promise<SendResult[]> {
    const results: SendResult[] = [];

    // Check if notifications are enabled
    if (!this.config.enabled) {
      return [{ success: false, channel: 'all', error: 'Notifications disabled' }];
    }

    // Check if this level should be notified
    if (!this.config.notifyOn.includes(payload.level)) {
      return [{ success: false, channel: 'all', error: `Level ${payload.level} not in notifyOn` }];
    }

    // Check quiet hours (except for critical if allowed)
    if (this.isQuietHours()) {
      if (payload.level !== 'critical' || !this.config.quietHours.allowCritical) {
        return [{ success: false, channel: 'all', error: 'Quiet hours active' }];
      }
    }

    // Check cooldown
    if (this.isInCooldown(payload.level)) {
      return [{ success: false, channel: 'all', error: `Cooldown active for ${payload.level}` }];
    }

    // No channels configured
    if (this.channels.length === 0) {
      return [{ success: false, channel: 'all', error: 'No channels configured' }];
    }

    // Redact payload
    const redactedPayload = redactObject(
      { ...payload, timestamp: payload.timestamp || new Date().toISOString() },
      { patterns: this.config.redaction.patterns, placeholder: this.config.redaction.placeholder }
    );

    // Send to all channels
    for (const channel of this.channels) {
      try {
        const result = await channel.send(redactedPayload);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          channel: channel.name,
          error: error instanceof Error ? redact(error.message) : 'Unknown error',
        });
      }
    }

    // Update cooldown if at least one channel succeeded
    if (results.some((r) => r.success)) {
      this.updateCooldown(payload.level);
    }

    return results;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<NotificationConfig> {
    return { ...this.config };
  }

  /**
   * Get channels
   */
  getChannels(): string[] {
    return this.channels.map((c) => c.name);
  }

  /**
   * Check if in cooldown
   */
  checkCooldown(level: NotificationLevel): { inCooldown: boolean; remainingMs: number } {
    const lastNotified = this.cooldownState.lastNotified[level] || 0;
    const cooldownMs = this.getCooldownMs(level);
    const elapsed = Date.now() - lastNotified;
    const remaining = Math.max(0, cooldownMs - elapsed);

    return {
      inCooldown: remaining > 0,
      remainingMs: remaining,
    };
  }

  /**
   * Reset cooldown (for testing)
   */
  resetCooldown(level?: NotificationLevel): void {
    if (level) {
      this.cooldownState.lastNotified[level] = 0;
    } else {
      this.cooldownState.lastNotified = {
        critical: 0,
        warn: 0,
        recovery: 0,
        info: 0,
      };
    }
    this.saveCooldownState();
  }
}

/**
 * Create a notification sender from default config
 */
export function createNotificationSender(
  options: NotificationSenderOptions = {}
): NotificationSender {
  return new NotificationSender(options);
}
