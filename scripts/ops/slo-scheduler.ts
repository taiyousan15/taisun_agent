/* istanbul ignore file */
/**
 * SLO Scheduler CLI - P15
 *
 * Runs the SLO scheduler daemon or a single check
 *
 * Usage:
 *   npm run ops:slo:scheduler         # Run once
 *   npm run ops:slo:scheduler -- --loop    # Run continuously
 *   npm run ops:slo:scheduler -- --dry-run # Dry run
 *
 * Options:
 *   --loop      Run continuously with interval
 *   --dry-run   Don't actually post alerts
 *   --verbose   Show detailed output
 */

import * as fs from 'fs';
import * as path from 'path';
import { runOnce, runLoop, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from '../../src/proxy-mcp/ops/scheduler';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'proxy-mcp', 'slo-scheduler.json');

/**
 * Load scheduler configuration
 */
function loadConfig(): SchedulerConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content) as SchedulerConfig;
    }
  } catch (error) {
    console.error('[scheduler] Failed to load config:', error);
  }
  return DEFAULT_SCHEDULER_CONFIG;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const loopMode = args.includes('--loop');
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');

  const config = loadConfig();

  console.log('[scheduler] SLO Scheduler starting...');
  console.log(`[scheduler] Interval: ${config.scheduler.intervalSeconds}s`);
  console.log(`[scheduler] Cooldown: WARN=${config.scheduler.cooldown.warnMinutes}min, CRITICAL=${config.scheduler.cooldown.criticalMinutes}min`);
  console.log(`[scheduler] Post on recovery: ${config.scheduler.postOnRecovery}`);
  if (dryRun) {
    console.log('[scheduler] DRY RUN MODE - no alerts will be posted');
  }
  console.log('');

  const options = {
    config,
    dryRun,
    verbose,
  };

  if (loopMode) {
    // Setup graceful shutdown
    const controller = new AbortController();

    process.on('SIGINT', () => {
      console.log('\n[scheduler] Received SIGINT, shutting down...');
      controller.abort();
    });

    process.on('SIGTERM', () => {
      console.log('\n[scheduler] Received SIGTERM, shutting down...');
      controller.abort();
    });

    await runLoop({
      ...options,
      signal: controller.signal,
      onTick: (result) => {
        const statusIcon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '🚨';
        const actionIcon = result.action === 'posted' ? '📤' : result.action === 'suppressed' ? '🔕' : '⏭️';
        console.log(`[${result.timestamp}] ${statusIcon} ${result.status.toUpperCase()} ${actionIcon} ${result.action}: ${result.reason}`);
        if (result.postUrl) {
          console.log(`  → ${result.postUrl}`);
        }
      },
      onError: (error) => {
        console.error(`[scheduler] Error: ${error.message}`);
      },
    });
  } else {
    // Single run
    const result = await runOnce(options);
    const statusIcon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '🚨';
    const actionIcon = result.action === 'posted' ? '📤' : result.action === 'suppressed' ? '🔕' : '⏭️';

    console.log(`${statusIcon} Status: ${result.status.toUpperCase()}`);
    console.log(`${actionIcon} Action: ${result.action}`);
    console.log(`📝 Reason: ${result.reason}`);
    if (result.postUrl) {
      console.log(`🔗 URL: ${result.postUrl}`);
    }

    // Exit with appropriate code
    if (result.status === 'critical') {
      process.exit(2);
    } else if (result.status === 'warn') {
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('[scheduler] Fatal error:', error);
  process.exit(3);
});
