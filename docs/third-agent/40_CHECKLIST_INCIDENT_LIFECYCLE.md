# Checklist: Incident Lifecycle Setup (P17)

Step-by-step guide for enabling incident correlation, noise reduction, and weekly digest.

## Prerequisites

- [ ] P15 SLO Scheduler implemented
- [ ] P16 Notifications implemented (optional, for notifications)
- [ ] GitHub token configured (for issue creation)

## Phase 1: Basic Incident Tracking

### 1.1 Verify Configuration

- [ ] `config/proxy-mcp/incidents.json` exists
- [ ] `enabled: true` (default)
- [ ] `createIssueOnCritical: false` (default, safe)
- [ ] `weeklyDigest.enabled: false` (default, safe)

### 1.2 Verify State Store

- [ ] `.taisun/incidents/` directory exists (created automatically)
- [ ] Write permissions verified
- [ ] `stateStore.path` set correctly

### 1.3 Test Correlation

```bash
# Run tests
npm run test -- tests/unit/incidents-correlate.test.ts
```

- [ ] All correlation tests pass
- [ ] Same input produces same key
- [ ] Different input produces different key

### 1.4 Test State Store

```bash
# Run tests
npm run test -- tests/unit/incidents-state-store.test.ts
```

- [ ] All state store tests pass
- [ ] State persists across restarts

## Phase 2: Noise Reduction

### 2.1 Configure Cooldown

```json
{
  "incidentCooldownMinutes": 120
}
```

- [ ] Cooldown configured appropriately for your needs
- [ ] Consider: how often do you want alerts for same issue?

### 2.2 Configure Correlation Key

```json
{
  "correlationConfig": {
    "includeSeverity": true,
    "includeReasons": true,
    "includeComponents": true,
    "maxReasonsForKey": 3
  }
}
```

- [ ] Decide: should different severities be separate incidents?
- [ ] Decide: how many reasons to include in key?
- [ ] Test: verify bundling works as expected

### 2.3 Test Noise Reduction

```bash
# Run tests
npm run test -- tests/unit/incidents-noise-reduction.test.ts
```

- [ ] All noise reduction tests pass
- [ ] Duplicates within cooldown are suppressed
- [ ] Status changes are allowed

## Phase 3: Weekly Digest (Optional)

### 3.1 Enable Digest Generation

```json
{
  "weeklyDigest": {
    "enabled": true,
    "createIssue": false,
    "dayOfWeek": 1,
    "topCauses": 3,
    "lookbackDays": 7
  }
}
```

- [ ] Digest enabled
- [ ] Issue creation still disabled
- [ ] Day of week configured

### 3.2 Test Manual Generation

```bash
# Generate digest
npx tsx scripts/ops/weekly-digest.ts

# Verify output
npx tsx scripts/ops/weekly-digest.ts --output test-digest.md
cat test-digest.md
```

- [ ] Digest generates without errors
- [ ] Summary shows correct counts
- [ ] Top causes are identified
- [ ] Recommended actions are relevant

### 3.3 Enable Digest Issue Creation (Optional)

```json
{
  "weeklyDigest": {
    "enabled": true,
    "createIssue": true
  }
}
```

- [ ] ⚠️ WARNING: This will create GitHub issues automatically
- [ ] Reviewed digest content before enabling
- [ ] Team notified of automated issue creation

## Phase 4: Incident Issue Creation (Optional)

### 4.1 Enable Critical Incident Issues

```json
{
  "createIssueOnCritical": true,
  "criticalPersistMinutes": 60
}
```

- [ ] ⚠️ WARNING: This will create GitHub issues automatically
- [ ] `criticalPersistMinutes` set appropriately
- [ ] Team notified of automated issue creation

### 4.2 Test Issue Creation

```bash
# Run tests with mock
npm run test -- tests/unit/incidents-create-issue.test.ts
```

- [ ] All issue creation tests pass
- [ ] Issues created only after persist time
- [ ] No duplicate issues for same incident

### 4.3 Monitor Initial Rollout

- [ ] Watch for unexpected issue creation
- [ ] Verify issue content is correct
- [ ] Adjust `criticalPersistMinutes` if needed

## Phase 5: Production Validation

### 5.1 Run All Tests

```bash
npm run test -- tests/unit/incidents-*.test.ts
npm run test -- tests/unit/digest-*.test.ts
```

- [ ] All incident tests pass
- [ ] All digest tests pass

### 5.2 Build Verification

```bash
npm run proxy:build
npm run lint
npm run typecheck
```

- [ ] Build succeeds
- [ ] No lint errors
- [ ] No type errors

### 5.3 Smoke Test

```bash
npm run proxy:smoke
```

- [ ] Smoke test passes

## Rollback Procedure

### If Issues Occur

1. **Disable Issue Creation**:
   ```json
   { "createIssueOnCritical": false }
   ```

2. **Disable Weekly Digest Issues**:
   ```json
   { "weeklyDigest": { "createIssue": false } }
   ```

3. **Increase Cooldown** (if too noisy):
   ```json
   { "incidentCooldownMinutes": 360 }
   ```

4. **Full Disable** (emergency):
   ```json
   { "enabled": false }
   ```

## Monitoring

### Key Metrics

- Incidents per day
- Suppression rate (cooldown effectiveness)
- Top causes distribution
- Resolution time

### Log Locations

- State file: `.taisun/incidents/state.jsonl`
- Weekly digest: `scripts/ops/weekly-digest.ts --output`

### Health Checks

```bash
# Check state file size
ls -la .taisun/incidents/state.jsonl

# Check recent incidents
tail -20 .taisun/incidents/state.jsonl | jq '.incidentKey, .severity, .currentStatus'
```

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| Too many notifications | Increase `incidentCooldownMinutes` |
| Missing important alerts | Decrease cooldown, include more in key |
| State not persisting | Check directory permissions |
| Digest empty | Verify lookback period covers incidents |
| Issues not created | Check `createIssueOnCritical: true` |
