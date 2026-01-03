# Notifications & Incident Workflow (P16)

Unified notification system with redaction, cooldown, quiet hours, and DLQ triage assistance.

## Overview

The notification system provides:

- **Multi-channel notifications** via Apprise (Slack, Discord, Email, etc.)
- **Automatic redaction** of sensitive data (API keys, tokens, passwords)
- **Cooldown** to prevent notification spam
- **Quiet hours** support for non-critical alerts
- **DLQ triage guidance** to help operators resolve issues quickly

## Quick Start

### 1. Configure Notifications

Create or edit `config/proxy-mcp/notifications.json`:

```json
{
  "enabled": true,
  "notifyOn": ["critical", "recovery"],
  "channels": {
    "apprise": {
      "enabled": true,
      "url": "${APPRISE_URL}"
    }
  },
  "cooldown": {
    "criticalMinutes": 30,
    "warnMinutes": 120,
    "recoveryMinutes": 60
  },
  "quietHours": {
    "enabled": false,
    "startHour": 22,
    "endHour": 7,
    "allowCritical": true
  }
}
```

### 2. Set Environment Variables

```bash
# In .env or environment
export APPRISE_URL=http://localhost:8000/notify
export APPRISE_URLS=slack://webhook_url
```

### 3. Start Apprise Container

```bash
docker compose -f docker-compose.ops.yml up -d apprise
```

### 4. Test Notifications

```bash
npm run ops:notify:test -- --mock
```

## Configuration

### Notification Levels

| Level | Description | Default Cooldown |
|-------|-------------|------------------|
| `critical` | System critical issues (DLQ overflow, circuit breakers open) | 30 min |
| `warn` | Warnings requiring attention | 120 min |
| `recovery` | Service recovered from non-OK to OK | 60 min |
| `info` | Informational (not typically notified) | - |

### Channels

#### Apprise (Recommended)

Apprise supports 80+ notification services through a single API.

```json
{
  "channels": {
    "apprise": {
      "enabled": true,
      "url": "${APPRISE_URL}"
    }
  }
}
```

#### Slack (via Apprise)

```bash
export APPRISE_URLS="slack://token_a/token_b/token_c"
```

#### Discord (via Apprise)

```bash
export APPRISE_URLS="discord://webhook_id/webhook_token"
```

### Cooldown

Prevents notification spam by enforcing minimum intervals between notifications of the same level.

```json
{
  "cooldown": {
    "criticalMinutes": 30,
    "warnMinutes": 120,
    "recoveryMinutes": 60
  }
}
```

### Quiet Hours

Suppress non-critical notifications during specified hours.

```json
{
  "quietHours": {
    "enabled": true,
    "startHour": 22,
    "endHour": 7,
    "allowCritical": true
  }
}
```

## Redaction

Sensitive data is automatically redacted before sending notifications:

| Pattern | Replacement |
|---------|-------------|
| OpenAI API keys (`sk-...`) | `[REDACTED]` |
| GitHub tokens (`ghp_...`, `gho_...`) | `[REDACTED]` |
| Slack tokens (`xoxb-...`, `xoxp-...`) | `[REDACTED]` |
| Stripe keys (`sk_live_...`, `sk_test_...`) | `[REDACTED]` |
| AWS access keys (`AKIA...`) | `[REDACTED]` |
| Database URLs with passwords | `[REDACTED]` |
| Webhook URLs | `[REDACTED]` |
| Email addresses | `[REDACTED]` |
| PEM private keys | `[REDACTED]` |

### Custom Redaction Patterns

Add custom patterns in configuration:

```json
{
  "redaction": {
    "patterns": ["MYSECRET\\d+", "INTERNAL_KEY_[A-Z]+"],
    "placeholder": "[REDACTED]"
  }
}
```

## DLQ Triage Assistance

When DLQ issues are detected, the system provides:

- **Pattern Analysis**: Identifies common failure patterns
- **Recommendations**: Actionable steps to resolve issues
- **Priority**: Helps operators prioritize fixes

### Common Patterns Detected

| Pattern | Recommendation |
|---------|---------------|
| Rate Limiting | Implement exponential backoff |
| Timeout | Increase timeout or check service health |
| Service Unavailable | Check if downstream service is running |
| Authentication Error | Verify API credentials and tokens |
| Parse Error | Check input data format |
| Memory Error | Increase memory limits |
| Resource Not Found | Verify resource paths |
| Circuit Breaker Open | Wait for reset or investigate failures |

## Integration with SLO Scheduler

The notification system integrates with the SLO scheduler to:

1. **Post alerts to GitHub Issues** when SLOs breach thresholds
2. **Send notifications** via configured channels
3. **Append DLQ triage guidance** when DLQ issues are detected
4. **Send recovery notifications** when status returns to OK

## Docker Compose Setup

```bash
# Start Apprise only
docker compose -f docker-compose.ops.yml up -d apprise

# Start with SLO scheduler (optional)
docker compose -f docker-compose.ops.yml --profile scheduler up -d
```

## API Reference

### NotificationSender

```typescript
import { createNotificationSender } from './proxy-mcp/ops/notify';

const sender = createNotificationSender({
  configPath: 'config/proxy-mcp/notifications.json',
});

await sender.send({
  level: 'critical',
  title: 'System Alert',
  summary: 'DLQ overflow detected',
  refId: '#123',
  issueUrl: 'https://github.com/owner/repo/issues/123',
});
```

### Redaction

```typescript
import { redact, containsSecrets } from './proxy-mcp/ops/notify';

const safe = redact('Token: ghp_abc123...');
// => "Token: [REDACTED]"

const hasSecrets = containsSecrets('ghp_abc123...');
// => true
```

### Triage Assist

```typescript
import { analyzeTriageAssist } from './proxy-mcp/ops/triage';

const result = analyzeTriageAssist(dlqEntries);
console.log(result.markdown);
```

## Troubleshooting

### Notifications not sending

1. Check APPRISE_URL environment variable
2. Verify Apprise container is running: `docker compose -f docker-compose.ops.yml ps`
3. Test with mock mode: `npm run ops:notify:test -- --mock`
4. Check cooldown status in state file: `.taisun/notify-state.json`

### Secrets appearing in notifications

1. Verify redaction patterns in config
2. Check for custom patterns that may be needed
3. Report missing patterns to add to built-in list

### Too many notifications

1. Increase cooldown values
2. Enable quiet hours for non-critical
3. Review notifyOn levels
