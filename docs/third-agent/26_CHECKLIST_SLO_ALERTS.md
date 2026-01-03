# Checklist: P14 SLO & Alerts

## Pre-deployment

- [ ] Review `config/proxy-mcp/slo.json` thresholds
- [ ] Adjust thresholds for your environment if needed
- [ ] Identify target issue for alert comments (or decide on new issue mode)
- [ ] Verify GitHub token has `repo` scope (for issue posting)

## Configuration

### Thresholds

- [ ] Queue size thresholds appropriate for workload
- [ ] Waiting approval thresholds match SLA expectations
- [ ] DLQ thresholds appropriate for failure tolerance
- [ ] Failure rate thresholds match quality targets

### Alerts

- [ ] Set `alerts.enabled` to `true`
- [ ] Choose mode: `comment` or `newIssue`
- [ ] For comment mode, set `targetIssueNumber`
- [ ] Decide on `createNewOnCritical` behavior

## Testing

- [ ] Run `npm run ops:slo:check` to verify metrics collection
- [ ] Check output contains all expected metrics
- [ ] Verify redaction works (no secrets in output)
- [ ] Test with `--json` flag for machine-readable output

## Alert Testing

- [ ] Create a test scenario with WARN threshold
- [ ] Run `npm run ops:slo:check:post -- --issue <TEST_ISSUE>`
- [ ] Verify comment was posted correctly
- [ ] Verify no secrets in posted content
- [ ] Test CRITICAL alert if `createNewOnCritical` is enabled

## Automation Setup

### Option A: Cron Job

- [ ] Add cron entry: `*/15 * * * * npm run ops:slo:check:post`
- [ ] Configure log rotation for output
- [ ] Set up alerting on exit code != 0

### Option B: GitHub Actions

- [ ] Add scheduled workflow
- [ ] Configure secrets for GITHUB_TOKEN
- [ ] Set up failure notifications

## Integration Verification

- [ ] SLO check finds jobs from JobStore
- [ ] DLQ count is accurate
- [ ] Circuit breaker status is detected
- [ ] Failure rate calculation is correct

## Documentation

- [ ] Document custom threshold values
- [ ] Document target issue number
- [ ] Add runbook link for WARN response
- [ ] Add runbook link for CRITICAL response

## Rollback

If issues occur:

1. [ ] Set `alerts.enabled` to `false` in slo.json
2. [ ] Stop cron job if configured
3. [ ] Investigate root cause
4. [ ] Fix configuration or code
5. [ ] Re-enable alerts

## Post-deployment

- [ ] Monitor first 24h for false positives
- [ ] Adjust thresholds based on baseline
- [ ] Document any environment-specific tuning
- [ ] Review alert effectiveness after 1 week

## Security Verification

- [ ] Verify secrets are redacted in console output
- [ ] Verify secrets are redacted in Issue comments
- [ ] Confirm no auto-remediation actions occur
- [ ] Verify only authorized users can adjust thresholds

## Response Procedures

### On WARN

- [ ] Review affected metrics
- [ ] Check logs for patterns
- [ ] Monitor for escalation to CRITICAL
- [ ] Document findings in ops issue

### On CRITICAL

- [ ] Immediate investigation required
- [ ] Check for system-wide issues
- [ ] Run `npm run jobs:dlq:triage` if DLQ involved
- [ ] Consider pausing job submission if needed
- [ ] Post-incident review required
