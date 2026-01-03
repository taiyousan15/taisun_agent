/**
 * Notification Sender Tests - P16
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationSender, createNotificationSender } from '../../src/proxy-mcp/ops/notify/sender';
import type { NotificationConfig, NotificationPayload } from '../../src/proxy-mcp/ops/notify/types';

describe('NotificationSender', () => {
  const testStatePath = path.join(__dirname, '../fixtures/test-notify-state.json');

  beforeEach(() => {
    // Clean up test state file
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  });

  afterEach(() => {
    // Clean up test state file
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('should use default config when no config provided', () => {
      const sender = new NotificationSender({ mock: true });
      const config = sender.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.notifyOn).toContain('critical');
      expect(config.notifyOn).toContain('recovery');
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<NotificationConfig> = {
        enabled: true,
        notifyOn: ['critical', 'warn', 'recovery'],
        cooldown: {
          criticalMinutes: 15,
          warnMinutes: 60,
          recoveryMinutes: 30,
        },
      };

      const sender = new NotificationSender({
        config: customConfig as NotificationConfig,
        mock: true,
      });
      const config = sender.getConfig();

      expect(config.notifyOn).toContain('warn');
      expect(config.cooldown.criticalMinutes).toBe(15);
    });
  });

  describe('send', () => {
    it('should send notification via mock channel', async () => {
      const sentPayloads: NotificationPayload[] = [];

      const sender = new NotificationSender({
        mock: true,
        onMockSend: (payload) => sentPayloads.push(payload),
      });

      const results = await sender.send({
        level: 'critical',
        title: 'Test Alert',
        summary: 'This is a test',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].success).toBe(true);
      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].title).toBe('Test Alert');
    });

    it('should not send if notifications disabled', async () => {
      const sender = new NotificationSender({
        config: {
          enabled: false,
          notifyOn: ['critical'],
          channels: {},
          cooldown: { criticalMinutes: 30, warnMinutes: 120, recoveryMinutes: 60 },
          quietHours: { enabled: false, startHour: 22, endHour: 7, allowCritical: true },
          redaction: { patterns: [], placeholder: '[REDACTED]' },
        },
        mock: true,
      });

      const results = await sender.send({
        level: 'critical',
        title: 'Test',
        summary: 'Test',
      });

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('disabled');
    });

    it('should not send if level not in notifyOn', async () => {
      const sender = new NotificationSender({
        config: {
          enabled: true,
          notifyOn: ['critical'], // warn not included
          channels: {},
          cooldown: { criticalMinutes: 30, warnMinutes: 120, recoveryMinutes: 60 },
          quietHours: { enabled: false, startHour: 22, endHour: 7, allowCritical: true },
          redaction: { patterns: [], placeholder: '[REDACTED]' },
        },
        mock: true,
      });

      const results = await sender.send({
        level: 'warn',
        title: 'Test',
        summary: 'Test',
      });

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('not in notifyOn');
    });

    it('should redact sensitive data in payload', async () => {
      const sentPayloads: NotificationPayload[] = [];

      const sender = new NotificationSender({
        mock: true,
        onMockSend: (payload) => sentPayloads.push(payload),
      });

      await sender.send({
        level: 'critical',
        title: 'Error with token: ghp_abc123def456ghi789jkl012',
        summary: 'Connection to postgres://user:pass@host/db failed',
      });

      expect(sentPayloads[0].title).toContain('[REDACTED]');
      expect(sentPayloads[0].summary).toContain('[REDACTED]');
    });
  });

  describe('cooldown', () => {
    it('should block notifications during cooldown', async () => {
      const sender = new NotificationSender({
        config: {
          enabled: true,
          notifyOn: ['critical'],
          channels: {},
          cooldown: { criticalMinutes: 30, warnMinutes: 120, recoveryMinutes: 60 },
          quietHours: { enabled: false, startHour: 22, endHour: 7, allowCritical: true },
          redaction: { patterns: [], placeholder: '[REDACTED]' },
        },
        mock: true,
        statePath: testStatePath,
      });

      // First notification
      const results1 = await sender.send({
        level: 'critical',
        title: 'First',
        summary: 'First alert',
      });
      expect(results1[0].success).toBe(true);

      // Second notification (should be blocked by cooldown)
      const results2 = await sender.send({
        level: 'critical',
        title: 'Second',
        summary: 'Second alert',
      });
      expect(results2[0].success).toBe(false);
      expect(results2[0].error).toContain('Cooldown');
    });

    it('should track cooldown per level', async () => {
      const sender = new NotificationSender({
        config: {
          enabled: true,
          notifyOn: ['critical', 'warn'],
          channels: {},
          cooldown: { criticalMinutes: 30, warnMinutes: 120, recoveryMinutes: 60 },
          quietHours: { enabled: false, startHour: 22, endHour: 7, allowCritical: true },
          redaction: { patterns: [], placeholder: '[REDACTED]' },
        },
        mock: true,
      });

      // Send critical
      await sender.send({ level: 'critical', title: 'Critical', summary: 'Test' });

      // Warn should still be allowed (different level)
      const warnResults = await sender.send({ level: 'warn', title: 'Warn', summary: 'Test' });
      expect(warnResults[0].success).toBe(true);
    });

    it('should allow reset of cooldown', async () => {
      const sender = new NotificationSender({
        mock: true,
        statePath: testStatePath,
      });

      await sender.send({ level: 'critical', title: 'First', summary: 'Test' });
      expect(sender.checkCooldown('critical').inCooldown).toBe(true);

      sender.resetCooldown('critical');
      expect(sender.checkCooldown('critical').inCooldown).toBe(false);
    });
  });

  describe('quiet hours', () => {
    it('should block non-critical during quiet hours', async () => {
      // Mock current hour to be within quiet hours
      const mockDate = new Date();
      mockDate.setHours(23); // 11 PM
      vi.setSystemTime(mockDate);

      const sender = new NotificationSender({
        config: {
          enabled: true,
          notifyOn: ['critical', 'warn'],
          channels: {},
          cooldown: { criticalMinutes: 30, warnMinutes: 120, recoveryMinutes: 60 },
          quietHours: {
            enabled: true,
            startHour: 22,
            endHour: 7,
            allowCritical: true,
          },
          redaction: { patterns: [], placeholder: '[REDACTED]' },
        },
        mock: true,
      });

      const warnResults = await sender.send({ level: 'warn', title: 'Warn', summary: 'Test' });
      expect(warnResults[0].success).toBe(false);
      expect(warnResults[0].error).toContain('Quiet hours');

      // Critical should still be allowed
      const criticalResults = await sender.send({
        level: 'critical',
        title: 'Critical',
        summary: 'Test',
      });
      expect(criticalResults[0].success).toBe(true);
    });
  });

  describe('state persistence', () => {
    it('should persist cooldown state', async () => {
      const sender1 = new NotificationSender({
        mock: true,
        statePath: testStatePath,
      });

      await sender1.send({ level: 'critical', title: 'Test', summary: 'Test' });

      // Create new sender, should load state
      const sender2 = new NotificationSender({
        mock: true,
        statePath: testStatePath,
      });

      expect(sender2.checkCooldown('critical').inCooldown).toBe(true);
    });
  });
});

describe('createNotificationSender', () => {
  it('should create sender with defaults', () => {
    const sender = createNotificationSender({ mock: true });
    expect(sender).toBeInstanceOf(NotificationSender);
  });
});
