/* istanbul ignore file */
/**
 * SLO Check CLI - P14
 *
 * Evaluates SLOs and optionally posts alerts
 *
 * Usage:
 *   npm run ops:slo:check [--post] [--json] [--issue NUMBER]
 *
 * Options:
 *   --post    Post alert to GitHub if WARN/CRITICAL
 *   --json    Output as JSON
 *   --issue   Target issue number for comments
 */

import {
  evaluateSLOs,
  loadSLOConfig,
  formatForConsole,
  formatForJSON,
  postAlert,
  AlertPostConfig,
  DEFAULT_ALERT_CONFIG,
} from '../../src/proxy-mcp/ops';
import { JobQueue, JobStoreService, JsonlJobStore } from '../../src/proxy-mcp/jobs';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldPost = args.includes('--post');
  const jsonOutput = args.includes('--json');
  const issueIndex = args.indexOf('--issue');
  const targetIssue = issueIndex >= 0 ? parseInt(args[issueIndex + 1], 10) : null;

  try {
    // Initialize job store and queue
    const jobsDir = process.env.JOBS_DIR || '.taisun/jobs';
    const store = new JobStoreService(new JsonlJobStore(`${jobsDir}/jobs.jsonl`));
    await store.init();
    const queue = new JobQueue(store);

    // Load config and evaluate
    const config = loadSLOConfig();
    const result = await evaluateSLOs(queue, config);

    // Output result
    if (jsonOutput) {
      console.log(formatForJSON(result));
    } else {
      console.log(formatForConsole(result));
    }

    // Post alert if requested
    if (shouldPost) {
      const alertConfig: AlertPostConfig = {
        ...DEFAULT_ALERT_CONFIG,
        ...config.alerts,
        targetIssueNumber: targetIssue || config.alerts?.targetIssueNumber || null,
      };

      const postResult = await postAlert(result, alertConfig);

      if (!jsonOutput) {
        console.log('');
        if (postResult.action === 'posted') {
          console.log(`Alert posted: ${postResult.url}`);
        } else if (postResult.action === 'skipped') {
          console.log(`Alert skipped: ${postResult.reason}`);
        } else {
          console.error(`Alert error: ${postResult.reason}`);
        }
      } else {
        console.log(JSON.stringify({ alertResult: postResult }, null, 2));
      }
    }

    // Exit with appropriate code
    if (result.overallStatus === 'critical') {
      process.exit(2);
    } else if (result.overallStatus === 'warn') {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('SLO check failed:', error instanceof Error ? error.message : error);
    process.exit(3);
  }
}

main();
