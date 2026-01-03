# Checklist: P15 SLO Scheduler

## Pre-deployment

- [ ] Complete P14 SLO & Alerts setup (see [26_CHECKLIST_SLO_ALERTS.md](./26_CHECKLIST_SLO_ALERTS.md))
- [ ] Review `config/proxy-mcp/slo-scheduler.json` settings
- [ ] Adjust interval and cooldown for your environment
- [ ] Decide target issue number or new issue mode
- [ ] Verify Docker Compose setup is ready

## Configuration

### Scheduler Settings

- [ ] `intervalSeconds` appropriate for workload (5min default)
- [ ] `cooldown.warnMinutes` sufficient to prevent spam (120min default)
- [ ] `cooldown.criticalMinutes` allows quick escalation (30min default)
- [ ] `postOnRecovery` set based on team preference

### Alert Settings

- [ ] `targetIssueNumber` set (or null for new issues)
- [ ] `owner` and `repo` correct for your repository
- [ ] Verify GitHub token has `repo` scope

## Testing

### Unit Test

- [ ] Run `npm run test:unit` - all scheduler tests pass
- [ ] Run `npm run typecheck` - no type errors

### Manual Test

- [ ] Run `npm run ops:slo:scheduler -- --dry-run --verbose`
- [ ] Verify status detection works
- [ ] Verify state file is created at `.taisun/slo-scheduler-state.json`

### State Persistence Test

- [ ] Run scheduler once
- [ ] Check state file contains correct values
- [ ] Run scheduler again - verify deduplication works
- [ ] Delete state file - verify fresh start behavior

### Cooldown Test

- [ ] Create WARN condition
- [ ] Run scheduler - verify alert posted
- [ ] Run scheduler again immediately - verify suppressed
- [ ] Wait for cooldown - verify re-posted

### Recovery Test

- [ ] Create WARN/CRITICAL condition
- [ ] Run scheduler - verify alert posted
- [ ] Fix the condition (return to OK)
- [ ] Run scheduler - verify recovery alert posted

## Docker Integration

### Build

- [ ] Run `npm run proxy:build` successfully
- [ ] Verify `dist/scripts/ops/slo-scheduler.js` exists

### Docker Compose

- [ ] Copy `ops/.env.ops.example` to `ops/.env.ops`
- [ ] Configure scheduler environment variables
- [ ] Run `docker compose -f ops/docker-compose.ops.yml config` - no errors
- [ ] Run `docker compose -f ops/docker-compose.ops.yml up -d scheduler`
- [ ] Check logs: `docker compose -f ops/docker-compose.ops.yml logs -f scheduler`
- [ ] Verify scheduler runs at configured interval

### Volume Persistence

- [ ] Verify state persists across container restarts
- [ ] Run `docker compose restart scheduler`
- [ ] Check state is preserved

## Production Deployment

### Environment

- [ ] Configure production GitHub token
- [ ] Set appropriate interval for production (consider rate limits)
- [ ] Set target issue number for ops alerts
- [ ] Review cooldown settings for production SLAs

### Monitoring

- [ ] Verify scheduler appears in Docker health checks
- [ ] Set up alerting on scheduler container failures
- [ ] Monitor first 24h for unexpected behavior

## Rollback

If issues occur:

1. [ ] Stop scheduler: `docker compose stop scheduler`
2. [ ] Set `scheduler.enabled: false` in config
3. [ ] Investigate root cause from logs
4. [ ] Fix configuration or code
5. [ ] Re-enable and restart

## Post-deployment

- [ ] Monitor first week for false positives
- [ ] Adjust cooldown based on actual alert frequency
- [ ] Document any environment-specific tuning
- [ ] Review and tune after 1 month

## Security Verification

- [ ] Verify secrets are redacted in logs
- [ ] Verify secrets are redacted in GitHub alerts
- [ ] Confirm state file doesn't contain secrets
- [ ] Verify only authorized users can modify config

## Response Procedures

### Scheduler Not Running

- [ ] Check container status
- [ ] Check for crash loops
- [ ] Review logs for errors
- [ ] Verify config file is valid JSON

### Too Many Alerts

- [ ] Increase cooldown values
- [ ] Review threshold settings
- [ ] Check for underlying infrastructure issues

### No Alerts When Expected

- [ ] Verify `scheduler.enabled: true`
- [ ] Check state file for cooldown status
- [ ] Verify GitHub token is valid
- [ ] Check target issue exists (if using comment mode)
