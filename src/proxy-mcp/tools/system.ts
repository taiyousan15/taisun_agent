/**
 * System Tools - Health check and system status
 *
 * P6: Enhanced with circuit breaker, rollout status, and recommendations
 * P12: Enhanced with job statistics and queue backpressure
 */

import { ToolResult } from '../types';
import { getRecentEventsSummary, generateReport, getLast24hPeriod } from '../observability';
import { getEnabledMcps, getAllMcps, getRolloutSummary } from '../internal/registry';
import { getCircuitSummary, getAllCircuitStates } from '../internal/circuit-breaker';

// Job system integration (lazy loaded to avoid circular dependencies)
let jobsIntegration: {
  getJobStats: () => Promise<{ queued: number; running: number; waiting_approval: number; succeeded: number; failed: number; canceled: number; total: number }>;
  getQueueStats: () => Promise<{ queued: number; running: number; dlq: number; backpressureActive: boolean; utilizationPercent: number }>;
  getWorkerStats: () => { processed: number; succeeded: number; failed: number; waitingApproval: number; currentJob: string | null; uptimeMs: number };
} | null = null;

/**
 * Register job system for health reporting
 */
export function registerJobsIntegration(integration: typeof jobsIntegration): void {
  jobsIntegration = integration;
}

const startTime = Date.now();

export async function systemHealth(): Promise<ToolResult> {
  const uptime = Date.now() - startTime;

  // Get MCP status
  const allMcps = getAllMcps();
  const enabledMcps = getEnabledMcps();

  // Get rollout status
  const rolloutSummary = getRolloutSummary();

  // Get circuit breaker status
  const circuitSummary = getCircuitSummary();
  const circuitStates = getAllCircuitStates();

  // Get observability metrics
  let metrics;
  try {
    metrics = getRecentEventsSummary(100);
  } catch {
    metrics = null;
  }

  // Get recommendations from recent report
  let recommendations: string[] = [];
  try {
    const period = getLast24hPeriod();
    const report = await generateReport(period);
    recommendations = report.recommendations;
  } catch {
    // Ignore report generation errors
  }

  // Determine overall health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const issues: string[] = [];

  // Check circuit breaker status
  if (circuitSummary.open > 0) {
    status = 'degraded';
    issues.push(`${circuitSummary.open} MCP(s) circuit open`);
  }

  // Check success rate
  if (metrics && metrics.last24h.successRate < 0.9) {
    status = 'unhealthy';
    issues.push(`Low success rate: ${Math.round(metrics.last24h.successRate * 100)}%`);
  } else if (metrics && metrics.last24h.successRate < 0.95) {
    if (status === 'healthy') status = 'degraded';
    issues.push(`Warning: success rate ${Math.round(metrics.last24h.successRate * 100)}%`);
  }

  // Get job system statistics (P12)
  let jobStats: {
    queued: number;
    running: number;
    waiting_approval: number;
    succeeded: number;
    failed: number;
    canceled: number;
    total: number;
  } | null = null;
  let queueStats: {
    queued: number;
    running: number;
    dlq: number;
    backpressureActive: boolean;
    utilizationPercent: number;
  } | null = null;
  let workerStats: {
    processed: number;
    succeeded: number;
    failed: number;
    waitingApproval: number;
    currentJob: string | null;
    uptimeMs: number;
  } | null = null;

  if (jobsIntegration) {
    try {
      [jobStats, queueStats] = await Promise.all([
        jobsIntegration.getJobStats(),
        jobsIntegration.getQueueStats(),
      ]);
      workerStats = jobsIntegration.getWorkerStats();

      // Check queue backpressure
      if (queueStats.backpressureActive) {
        if (status === 'healthy') status = 'degraded';
        issues.push('Queue backpressure active');
      }

      // Check DLQ size
      if (queueStats.dlq > 10) {
        if (status === 'healthy') status = 'degraded';
        issues.push(`DLQ has ${queueStats.dlq} jobs`);
      }

      // Check queue utilization
      if (queueStats.utilizationPercent > 90) {
        if (status === 'healthy') status = 'degraded';
        issues.push(`Queue utilization at ${queueStats.utilizationPercent}%`);
      }
    } catch {
      // Ignore job system errors
    }
  }

  // Build per-MCP status
  const mcpStatus = enabledMcps.map((mcp) => {
    const circuitState = circuitStates.get(mcp.name) || 'closed';
    const rollout = rolloutSummary.mcps.find((r) => r.name === mcp.name);
    return {
      name: mcp.name,
      enabled: true,
      circuit: circuitState,
      rollout: rollout?.mode || 'full',
      canaryPercent: rollout?.canaryPercent,
    };
  });

  return {
    success: true,
    data: {
      status,
      issues: issues.length > 0 ? issues : undefined,
      uptime,
      version: '0.2.0',
      timestamp: new Date().toISOString(),
      mcps: {
        total: allMcps.length,
        enabled: enabledMcps.length,
        status: mcpStatus,
      },
      circuits: {
        total: circuitSummary.total,
        closed: circuitSummary.closed,
        open: circuitSummary.open,
        halfOpen: circuitSummary.halfOpen,
      },
      rollout: {
        overlayActive: rolloutSummary.overlayActive,
        mcps: rolloutSummary.mcps,
      },
      metrics: metrics
        ? {
            totalEvents: metrics.total,
            last24h: {
              success: metrics.last24h.successCount,
              failure: metrics.last24h.failureCount,
              successRate: Math.round(metrics.last24h.successRate * 100) + '%',
              avgDurationMs: metrics.last24h.avgDurationMs,
            },
            topErrors: metrics.topErrors,
          }
        : null,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      // P12: Job system statistics
      jobs: jobStats
        ? {
            store: {
              queued: jobStats.queued,
              running: jobStats.running,
              waiting_approval: jobStats.waiting_approval,
              succeeded: jobStats.succeeded,
              failed: jobStats.failed,
              canceled: jobStats.canceled,
              total: jobStats.total,
            },
            queue: queueStats
              ? {
                  queued: queueStats.queued,
                  running: queueStats.running,
                  dlq: queueStats.dlq,
                  backpressureActive: queueStats.backpressureActive,
                  utilizationPercent: queueStats.utilizationPercent,
                }
              : null,
            worker: workerStats
              ? {
                  processed: workerStats.processed,
                  succeeded: workerStats.succeeded,
                  failed: workerStats.failed,
                  waitingApproval: workerStats.waitingApproval,
                  currentJob: workerStats.currentJob,
                  uptimeMs: workerStats.uptimeMs,
                }
              : null,
          }
        : null,
    },
  };
}
