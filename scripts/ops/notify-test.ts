#!/usr/bin/env node
/* istanbul ignore file */
/**
 * Notification Test CLI - P16
 *
 * Test notification sending with redaction.
 *
 * Usage:
 *   npx ts-node scripts/ops/notify-test.ts [--level critical|warn|recovery] [--mock]
 */

import { createNotificationSender, redact, containsSecrets } from '../../src/proxy-mcp/ops/notify';

async function main() {
  const args = process.argv.slice(2);
  const mock = args.includes('--mock');
  const levelArg = args.find((a) => a.startsWith('--level='))?.split('=')[1];
  const level = (levelArg as 'critical' | 'warn' | 'recovery') || 'critical';

  console.log('Notification Test CLI');
  console.log('=====================\n');

  // Test redaction
  console.log('Testing redaction:');
  const testStrings = [
    'API key: sk-abc123def456ghi789jkl012mno345pqr678',
    'Database: postgres://user:password@localhost:5432/db',
    'Token: ghp_abcdefghijklmnopqrstuvwxyz123456',
    'Normal text without secrets',
    'Webhook: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
  ];

  for (const str of testStrings) {
    const hasSecrets = containsSecrets(str);
    const redacted = redact(str);
    console.log(`  Input:    ${str}`);
    console.log(`  Secrets:  ${hasSecrets}`);
    console.log(`  Redacted: ${redacted}`);
    console.log();
  }

  // Test notification sending
  console.log('\nTesting notification sending:');
  console.log(`  Mode: ${mock ? 'Mock' : 'Live'}`);
  console.log(`  Level: ${level}`);

  const sender = createNotificationSender({
    mock,
    configPath: 'config/proxy-mcp/notifications.json',
    onMockSend: (payload) => {
      console.log('\n  Mock notification sent:');
      console.log(`    Title: ${payload.title}`);
      console.log(`    Summary: ${payload.summary}`);
      console.log(`    Level: ${payload.level}`);
    },
  });

  const results = await sender.send({
    level,
    title: `Test ${level.toUpperCase()} Notification`,
    summary: `This is a test ${level} notification from notify-test CLI.`,
    refId: 'test-ref-123',
    issueUrl: 'https://github.com/taiyousan15/taisun_agent/issues/1',
  });

  console.log('\n  Results:');
  for (const result of results) {
    console.log(`    ${result.channel}: ${result.success ? 'SUCCESS' : `FAILED (${result.error})`}`);
  }

  console.log('\nConfiguration:');
  const config = sender.getConfig();
  console.log(`  Enabled: ${config.enabled}`);
  console.log(`  NotifyOn: ${config.notifyOn.join(', ')}`);
  console.log(`  Channels: ${sender.getChannels().join(', ') || 'none'}`);
  console.log(`  Quiet Hours: ${config.quietHours.enabled ? `${config.quietHours.startHour}:00-${config.quietHours.endHour}:00` : 'disabled'}`);

  console.log('\nCooldown status:');
  for (const lvl of ['critical', 'warn', 'recovery'] as const) {
    const status = sender.checkCooldown(lvl);
    console.log(`  ${lvl}: ${status.inCooldown ? `${Math.round(status.remainingMs / 1000)}s remaining` : 'ready'}`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
