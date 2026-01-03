# DLQ Triage Guide

## Overview

Dead Letter Queue (DLQ) contains jobs that have exhausted their retry attempts or encountered unrecoverable errors. Regular triage ensures failed jobs are analyzed, root causes are identified, and appropriate actions are taken.

## Quick Reference

```bash
# View DLQ summary
npm run jobs:dlq:triage

# Export as JSON (for automation)
npm run jobs:dlq:triage -- --json

# Create GitHub issue with triage summary
npm run jobs:dlq:triage -- --post
```

## When to Triage

- **Daily**: Check DLQ as part of daily ops routine
- **Alerts**: When monitoring shows DLQ count > 10
- **After Incidents**: Post-incident review of failed jobs
- **Before Releases**: Clear or resolve DLQ items before deployment

## Understanding the Summary

### Failure Reason Categories

| Category | Typical Causes | Action |
|----------|----------------|--------|
| `Timeout` | Slow external API, network issues | Retry or increase timeout |
| `Auth failed` | Expired tokens, wrong credentials | Rotate credentials, retry |
| `Rate limited` | Too many requests | Wait, implement backoff |
| `Connection refused` | Service down, wrong endpoint | Fix config, wait for recovery |
| `Validation error` | Bad input data | Fix data, retry |
| `Max attempts exceeded` | Persistent transient failures | Investigate root cause |

### Entry Fields

- **jobId**: Unique identifier for tracing
- **entrypoint**: The execution path (e.g., `supervisor`, `mcp-call`)
- **refId**: Memory reference for context lookup
- **reason**: Failure reason (sanitized, no secrets)
- **addedAt**: When job entered DLQ
- **attempts**: Number of execution attempts

## Triage Workflow

### 1. Review Summary

```bash
npm run jobs:dlq:triage
```

Look for:
- Most common failure reasons
- Patterns (same entrypoint, similar times)
- Unusually high counts

### 2. Investigate Root Cause

For each pattern:
1. Check application logs for the time period
2. Review related external service status
3. Check memory entries with `refId` for context

### 3. Decide Action

| Scenario | Action |
|----------|--------|
| Transient failure, now resolved | Retry from DLQ |
| Configuration error | Fix config, retry |
| Bad input data | Mark as non-recoverable, clear |
| External service issue | Wait for resolution, retry |
| Bug in code | Fix bug, retry |

### 4. Execute Resolution

```bash
# Retry a specific job from DLQ
npm run jobs:dlq:retry -- --job-id <JOB_ID>

# Clear a specific job from DLQ (non-recoverable)
npm run jobs:dlq:clear -- --job-id <JOB_ID>

# Clear all DLQ entries (use with caution)
npm run jobs:dlq:clear -- --all
```

### 5. Document

Create triage issue if needed:
```bash
npm run jobs:dlq:triage -- --post
```

## Security Notes

### Redaction

All DLQ output automatically redacts:
- GitHub tokens (`ghp_*`, `gho_*`)
- API keys (`sk-*`, `xoxb-*`, `xoxp-*`)
- Database connection strings
- Credentials in URLs

Never share unredacted failure reasons externally.

### GitHub Issue Posting

When using `--post`:
- Requires `GITHUB_TOKEN` environment variable
- Posts to repository detected from git remote
- Or set `GITHUB_REPO=owner/repo` explicitly

## Integration with Reports

Job metrics including DLQ count are included in:
- Daily reports: `npm run obs:report:daily`
- Weekly reports: `npm run obs:report:weekly`
- System health: `system_health` tool

Reports will recommend triage when DLQ count > 0.

## Monitoring

Set up alerts for:
- DLQ count > 10 (warning)
- DLQ count > 50 (critical)
- DLQ growth rate > 10/hour

## Troubleshooting

### Empty DLQ

```
[dlq-triage] DLQ is empty.
```

This is normal when all jobs are succeeding.

### Cannot Post Issue

```
ERROR: GITHUB_TOKEN environment variable is required
```

Export the token:
```bash
export GITHUB_TOKEN=ghp_your_token_here
npm run jobs:dlq:triage -- --post
```

### Cannot Detect Repository

```
ERROR: Could not determine GitHub repository
```

Set explicitly:
```bash
export GITHUB_REPO=owner/repo
npm run jobs:dlq:triage -- --post
```

## Related

- [P12 Execution Plane Architecture](./38_EXECUTION_PLANE_ARCHITECTURE.md)
- [P12 Runbook](./00_RUNBOOK_0-12.md)
- [Observability Reports](./15_CHECKLIST_OBS_REPORT.md)
