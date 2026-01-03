# P13: Ops Automation for Jobs

## Overview

P13 extends the P12 Execution Plane with operational automation features:

1. **Job Metrics in Reports** - Daily/weekly reports now include queue status, DLQ count, and failure patterns
2. **DLQ Triage CLI** - Summarized view of dead-letter queue with GitHub issue creation
3. **Deployment Templates** - Docker Compose for production deployment of proxy/worker/watcher

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Observability Layer                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │
│  │ Daily Report│   │Weekly Report│   │ DLQ Triage  │            │
│  │ + Job Stats │   │ + Job Stats │   │    CLI      │            │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘            │
│         └─────────────────┼─────────────────┘                    │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Job Metrics Collector                     ││
│  │  - queueSize / running / waitingApproval                     ││
│  │  - dlqCount / succeeded / failed                             ││
│  │  - topFailureReasons (redacted)                              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     P12 Execution Plane                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ JobStore │◄───│  Queue   │◄───│  Worker  │    │ Watcher  │  │
│  │ (jsonl)  │    │ +DLQ     │    │(executor)│    │(approvals)│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Job Metrics in Reports

Reports now include a "Job実行状態" section:

```markdown
## Job実行状態

| 項目 | 値 |
|------|-----|
| キュー待ち | 5 |
| 実行中 | 2 |
| 承認待ち | 3 |
| 成功 | 100 |
| 失敗 | 5 |
| DLQ | 1 |
| バックプレッシャー | 正常 |
| キュー使用率 | 10% |

### 主な失敗理由
- Connection timeout: 3件
- Auth failed: 2件
```

Recommendations now include job-related warnings:
- DLQ has items → "トリアージを実行してください"
- Backpressure active → "処理能力を確認してください"
- Many waiting approval → "Approval Watcherを確認してください"

### DLQ Triage CLI

```bash
# View summary
npm run jobs:dlq:triage

# Export as JSON
npm run jobs:dlq:triage -- --json

# Create GitHub issue
npm run jobs:dlq:triage -- --post
```

Features:
- Summarizes DLQ entries (up to 20)
- Aggregates failure reasons
- **Redacts sensitive data** (tokens, API keys, credentials)
- Creates formatted GitHub issue for tracking

### Deployment Templates

Production-ready Docker Compose in `ops/`:

```
ops/
├── docker-compose.ops.yml    # Service definitions
├── .env.ops.example          # Environment template
└── README.md                 # Operations guide
```

Services:
- `proxy`: MCP proxy server (port 3100)
- `worker`: Job execution worker
- `watcher`: GitHub approval polling

## Usage

### Generate Reports with Job Metrics

```bash
# Daily report
npm run obs:report:daily

# Weekly report
npm run obs:report:weekly

# Post to GitHub
npm run obs:post:daily
```

### Triage DLQ

```bash
# View current DLQ status
npm run jobs:dlq:triage

# Create triage issue on GitHub
npm run jobs:dlq:triage -- --post
```

### Deploy to Production

```bash
# Configure
cp ops/.env.ops.example ops/.env.ops
# Edit ops/.env.ops with your tokens

# Start services
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops up -d

# Check health
curl http://localhost:3100/health
```

## Security

### Redaction

All external-facing output redacts:
- `ghp_*`, `gho_*` → `[REDACTED_GH_TOKEN]`
- `sk-*` → `[REDACTED_API_KEY]`
- `xoxb-*`, `xoxp-*` → `[REDACTED_SLACK_*]`
- DB connection strings → `[REDACTED_DB_DSN]`

### Environment Variables

Never commit:
- `ops/.env.ops`
- Any file containing `GITHUB_TOKEN`, `NOTION_TOKEN`, etc.

## Operational Workflow

### Daily Operations

1. **Morning**: Check `system_health` for overnight issues
2. **Mid-day**: Review DLQ if count > 0
3. **Evening**: Generate daily report

### When DLQ Grows

1. Run `npm run jobs:dlq:triage`
2. Identify failure patterns
3. Fix root cause (config, external service, bug)
4. Retry or clear affected jobs
5. Create tracking issue if needed

### Approval Backlog

1. Check watcher logs for polling errors
2. Verify `GITHUB_TOKEN` permissions
3. Check GitHub API rate limits
4. Review pending approval issues

## Files Added (P13)

```
src/proxy-mcp/
├── observability/
│   └── report.ts           # Updated with job metrics
├── jobs/
│   └── dlq-triage.ts       # New: DLQ triage module

scripts/
└── jobs/
    └── dlq-triage.ts       # New: CLI entry point

ops/
├── docker-compose.ops.yml  # New: Docker Compose
├── .env.ops.example        # New: Environment template
└── README.md               # New: Ops guide

docs/third-agent/
├── 39_DLQ_TRIAGE.md        # New: DLQ triage guide
├── 40_OPS_AUTOMATION_JOBS.md # This file
└── 25_CHECKLIST_OPS_AUTOMATION_JOBS.md # New: Checklist

tests/unit/
├── observability-report-jobs.test.ts # New: Report tests
└── dlq-triage.test.ts      # New: Triage tests
```

## Related

- [P12 Execution Plane Architecture](./38_EXECUTION_PLANE_ARCHITECTURE.md)
- [DLQ Triage Guide](./39_DLQ_TRIAGE.md)
- [Ops Templates README](../ops/README.md)
