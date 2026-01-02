/**
 * System Tools - Health check and system status
 */

import { ToolResult } from '../types';
import { getRecentEventsSummary } from '../observability';
import { getEnabledMcps, getAllMcps } from '../internal/registry';

const startTime = Date.now();

export function systemHealth(): ToolResult {
  const uptime = Date.now() - startTime;

  // Get MCP status
  const allMcps = getAllMcps();
  const enabledMcps = getEnabledMcps();

  // Get observability metrics
  let metrics;
  try {
    metrics = getRecentEventsSummary(100);
  } catch {
    metrics = null;
  }

  return {
    success: true,
    data: {
      status: 'healthy',
      uptime: uptime,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      mcps: {
        total: allMcps.length,
        enabled: enabledMcps.length,
        names: enabledMcps.map((m) => m.name),
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
    },
  };
}
