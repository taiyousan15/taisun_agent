# SLO & Alerts Design - P14

## Overview

SLO (Service Level Objectives) monitoring and alerting system for the proxy-mcp execution plane. Detects anomalies early and posts summarized alerts to GitHub Issues.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SLO Check Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Config  │───▶│ Collect  │───▶│ Evaluate │───▶│  Alert   │  │
│  │ slo.json │    │ Metrics  │    │ vs SLOs  │    │  Post    │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                        │              │               │         │
│                        ▼              ▼               ▼         │
│                  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│                  │ JobStore │  │ OK/WARN/ │  │ Issue Comment│  │
│                  │ Queue    │  │ CRITICAL │  │ or New Issue │  │
│                  │ DLQ      │  └──────────┘  └──────────────┘  │
│                  │ Circuit  │                                   │
│                  └──────────┘                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. SLO Configuration (`config/proxy-mcp/slo.json`)

Configurable thresholds for each metric:

| Metric | Warn Threshold | Critical Threshold | Description |
|--------|---------------|-------------------|-------------|
| queue_size | 50 | 200 | Jobs waiting in queue |
| waiting_approval | 60min | 360min | Max time jobs waiting for approval |
| dlq_new | 5 | 20 | New DLQ entries in 24h |
| failure_rate | 5% | 15% | Job failure rate |
| circuit_breakers | 1 open | 3 open | Open circuit breakers |

### 2. Metrics Collection (`src/proxy-mcp/ops/slo/evaluate.ts`)

Collects metrics from:
- **JobStore**: Queue size, running, waiting approval, succeeded, failed
- **JobQueue**: DLQ count, DLQ new entries (last 24h)
- **Circuit Breaker**: Open/closed/half-open counts

### 3. Evaluation Engine

Compares metrics against thresholds:
- **OK**: All metrics within thresholds
- **WARN**: At least one metric exceeds warn threshold
- **CRITICAL**: At least one metric exceeds critical threshold

### 4. Alert Posting (`src/proxy-mcp/ops/alerts/post.ts`)

Posts alerts to GitHub Issues:
- **Comment Mode**: Adds comment to existing "Ops Dashboard" issue
- **New Issue Mode**: Creates new issue for each alert
- **Hybrid**: Comments for WARN, new issue for CRITICAL

## Usage

### CLI

```bash
# Check SLOs (console output)
npm run ops:slo:check

# Check and post alert if WARN/CRITICAL
npm run ops:slo:check:post

# Check with JSON output
npm run ops:slo:check -- --json

# Post to specific issue
npm run ops:slo:check -- --post --issue 123
```

### Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | OK | All SLOs within thresholds |
| 1 | WARN | At least one warning |
| 2 | CRITICAL | At least one critical |
| 3 | ERROR | Check failed |

### Automation

```bash
# Cron job example (every 15 minutes)
*/15 * * * * cd /path/to/project && npm run ops:slo:check:post >> /var/log/slo-check.log 2>&1
```

## Security

### Redaction

All output is redacted to prevent secret leakage:
- GitHub tokens (ghp_*, gho_*)
- API keys (sk-*)
- Slack tokens (xoxb-*, xoxp-*)
- Connection strings with credentials

### No Auto-Actions

The system only **observes and reports**:
- Does NOT automatically scale workers
- Does NOT automatically retry failed jobs
- Does NOT automatically clear DLQ

Human decision required for remediation.

## Integration with P13

| P13 Feature | P14 Integration |
|-------------|-----------------|
| DLQ Triage | Alert links to `npm run jobs:dlq:triage` |
| Job Metrics | Used for queue/failure rate evaluation |
| Reports | SLO status included in daily reports |

## Configuration Reference

### slo.json

```json
{
  "version": "1.0.0",
  "thresholds": {
    "queue": {
      "sizeWarn": 50,
      "sizeCritical": 200
    },
    "waitingApproval": {
      "warnMinutes": 60,
      "criticalMinutes": 360
    },
    "dlq": {
      "newWarn": 5,
      "newCritical": 20
    },
    "jobFailure": {
      "rateWarn": 0.05,
      "rateCritical": 0.15
    },
    "circuitBreaker": {
      "openWarn": 1,
      "openCritical": 3
    }
  },
  "alerts": {
    "enabled": true,
    "mode": "comment",
    "targetIssueNumber": null,
    "createNewOnCritical": false
  }
}
```

## Recommended Thresholds by Environment

| Environment | Queue Warn | Queue Critical | Notes |
|-------------|-----------|----------------|-------|
| Development | 20 | 50 | Tighter for early detection |
| Staging | 50 | 200 | Match production |
| Production | 50 | 200 | Default values |

## Troubleshooting

### Alert not posting

1. Check `alerts.enabled` is `true`
2. For comment mode, verify `targetIssueNumber` is set
3. Check GitHub token has `repo` scope
4. Verify repository is accessible

### False positives

1. Adjust thresholds in `slo.json`
2. Consider evaluation period (default: 24h)
3. Check for transient spikes vs. sustained issues

### Missing metrics

1. Ensure JobStore is initialized
2. Check `.taisun/jobs/` directory exists
3. Verify proxy-mcp is running
