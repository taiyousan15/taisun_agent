# Incident Lifecycle (P17)

Incident correlation, noise reduction, and weekly improvement digest.

## Overview

The incident lifecycle system provides:

- **Incident Correlation**: Groups similar incidents by correlation key (hash of severity + reasons + components)
- **State Management**: Persistent tracking of incident state (firstSeen, lastSeen, occurrences)
- **Noise Reduction**: Cooldown-based deduplication for posts and notifications
- **Incident Issue Creation**: Optional auto-creation of GitHub issues for persistent critical incidents
- **Weekly Digest**: Optional summary of top causes and recommended improvements

## Core Concepts

### Correlation Key

The correlation key uniquely identifies an incident type:

```
incidentKey = hash(severity + topReasons + affectedComponents)
```

Example:
- Input: `{ severity: 'critical', reasons: ['timeout', 'connection refused'], components: ['api-gateway'] }`
- Key: `a1b2c3d4e5f6g7h8` (16-char hash)

Same key = same incident type = bundled together

### Incident State

```typescript
interface IncidentState {
  incidentKey: string;          // Unique correlation key
  firstSeen: string;            // First occurrence
  lastSeen: string;             // Most recent occurrence
  currentStatus: 'active' | 'resolved' | 'suppressed';
  severity: 'critical' | 'warn' | 'info' | 'ok';
  lastPostedAt: string | null;  // Last issue post
  lastNotifiedAt: string | null; // Last notification
  occurrenceCount: number;
  topReasons: string[];         // Redacted
  affectedComponents: string[];
  summary: string;              // Redacted
}
```

### Action Decision

On each occurrence, the system decides:

| Condition | shouldPost | shouldNotify |
|-----------|------------|--------------|
| First occurrence | ✅ | ✅ |
| Within cooldown | ❌ | ❌ |
| After cooldown | ✅ | ✅ |
| Status change | ✅ | ✅ |
| Severity escalation | ✅ | ✅ |

## Configuration

### `config/proxy-mcp/incidents.json`

```json
{
  "enabled": true,
  "createIssueOnCritical": false,
  "criticalPersistMinutes": 60,
  "incidentCooldownMinutes": 120,
  "correlationConfig": {
    "includeSeverity": true,
    "includeReasons": true,
    "includeComponents": true,
    "maxReasonsForKey": 3
  },
  "weeklyDigest": {
    "enabled": false,
    "createIssue": false,
    "dayOfWeek": 1,
    "topCauses": 3,
    "lookbackDays": 7
  },
  "stateStore": {
    "type": "jsonl",
    "path": ".taisun/incidents/state.jsonl",
    "maxEntries": 10000,
    "retentionDays": 30
  },
  "redaction": {
    "enabled": true,
    "patterns": []
  }
}
```

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable incident lifecycle |
| `createIssueOnCritical` | `false` | Auto-create issue for persistent critical |
| `criticalPersistMinutes` | `60` | Minutes before creating incident issue |
| `incidentCooldownMinutes` | `120` | Cooldown for same incident |

## Safe Enablement

### Step 1: Enable Incident Tracking (default)

```json
{
  "enabled": true,
  "createIssueOnCritical": false,
  "weeklyDigest": { "enabled": false }
}
```

### Step 2: Enable Weekly Digest (optional)

```json
{
  "weeklyDigest": {
    "enabled": true,
    "createIssue": false
  }
}
```

Then run manually:
```bash
npx tsx scripts/ops/weekly-digest.ts
```

### Step 3: Enable Incident Issue Creation (optional)

```json
{
  "createIssueOnCritical": true,
  "criticalPersistMinutes": 60
}
```

**Warning**: This will create GitHub issues automatically.

### Step 4: Enable Digest Issue Creation (optional)

```json
{
  "weeklyDigest": {
    "enabled": true,
    "createIssue": true
  }
}
```

## Noise Tuning

### Too Many Notifications

1. Increase cooldown:
   ```json
   { "incidentCooldownMinutes": 240 }
   ```

2. Configure correlation to bundle more:
   ```json
   {
     "correlationConfig": {
       "includeSeverity": false,
       "maxReasonsForKey": 1
     }
   }
   ```

### Missing Important Alerts

1. Decrease cooldown:
   ```json
   { "incidentCooldownMinutes": 30 }
   ```

2. Include more detail in correlation:
   ```json
   {
     "correlationConfig": {
       "includeSeverity": true,
       "maxReasonsForKey": 5
     }
   }
   ```

## Weekly Digest

### Manual Generation

```bash
# Generate markdown
npx tsx scripts/ops/weekly-digest.ts

# Custom lookback
npx tsx scripts/ops/weekly-digest.ts --lookback-days 14

# Output to file
npx tsx scripts/ops/weekly-digest.ts --output digest.md

# JSON output
npx tsx scripts/ops/weekly-digest.ts --json
```

### Digest Contents

1. **Summary**: Total incidents, severity breakdown, resolution stats
2. **Top Causes**: Most frequent reasons with percentage
3. **Recommended Actions**: Pattern-matched improvements
4. **Component Health**: Health score per component

## API Reference

### Correlation

```typescript
import { generateCorrelationKey, buildCorrelationInput } from './incidents';

const input = buildCorrelationInput({
  severity: 'critical',
  reasons: ['timeout'],
  components: ['api-gateway'],
});

const key = generateCorrelationKey(input);
```

### State Update

```typescript
import { updateIncidentState, createStateStore } from './incidents';

const store = createStateStore(config.stateStore);
const { state, decision } = await updateIncidentState(store, input, config);

if (decision.shouldPost) {
  // Post to GitHub issue
}
if (decision.shouldNotify) {
  // Send notification
}
```

### Digest Generation

```typescript
import { generateWeeklyDigest, digestToMarkdown } from './digest';

const digest = await generateWeeklyDigest(store, {
  lookbackDays: 7,
  topCauses: 3,
});

const markdown = digestToMarkdown(digest);
```

## Troubleshooting

### Incidents Not Being Bundled

1. Check correlation config - may be too specific
2. Review state store path exists
3. Check logs for correlation key generation

### Too Much Noise

1. Increase `incidentCooldownMinutes`
2. Reduce `maxReasonsForKey` to bundle more
3. Set `includeSeverity: false` to ignore severity in key

### State Not Persisting

1. Check `.taisun/incidents/` directory exists
2. Verify write permissions
3. Check `stateStore.path` in config

### Digest Not Generating

1. Verify incidents exist in state store
2. Check `lookbackDays` covers incident period
3. Run with `--json` to debug data
