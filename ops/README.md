# TAISUN Operations Templates

Production deployment templates for running the TAISUN execution plane.

## Components

| Service | Description | Port |
|---------|-------------|------|
| **proxy** | MCP proxy server - routes Claude to internal MCPs | 3100 |
| **worker** | Job worker - executes queued jobs with supervisor | - |
| **watcher** | Approval watcher - polls GitHub for job approvals | - |

## Quick Start

### 1. Prerequisites

- Docker Engine 24.0+
- Docker Compose v2+
- GitHub Personal Access Token (with `repo` scope)

### 2. Configuration

```bash
# Copy environment template
cp ops/.env.ops.example ops/.env.ops

# Edit with your values
vi ops/.env.ops
```

Required environment variables:
- `GITHUB_TOKEN`: For approval watcher and GitHub operations
- `WATCHER_REPO`: Repository for approval polling (e.g., `owner/repo`)

### 3. Start Services

```bash
# Start all services
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops up -d

# Check status
docker compose -f ops/docker-compose.ops.yml ps

# View logs
docker compose -f ops/docker-compose.ops.yml logs -f
```

### 4. Verify

```bash
# Check proxy health
curl http://localhost:3100/health

# Check system status via MCP
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"system_health"}}'
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Host                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                  │
│  │  proxy  │    │ worker  │    │ watcher │                  │
│  │  :3100  │    │         │    │         │                  │
│  └────┬────┘    └────┬────┘    └────┬────┘                  │
│       │              │              │                        │
│       └──────────────┼──────────────┘                        │
│                      │                                       │
│              ┌───────▼───────┐                               │
│              │  Named Volumes │                              │
│              ├───────────────┤                               │
│              │ jobs-data     │ /data/jobs/store.jsonl       │
│              │ obs-data      │ /data/observability/         │
│              │ memory-data   │ /data/memory/                │
│              └───────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Persistence

All persistent data is stored in Docker named volumes:

| Volume | Path | Contents |
|--------|------|----------|
| `jobs-data` | `/data/jobs` | Job store (JSONL) |
| `obs-data` | `/data/observability` | Event logs, reports |
| `memory-data` | `/data/memory` | Memory store |

### Backup

```bash
# Backup all data
docker run --rm \
  -v taisun_agent_jobs-data:/source/jobs:ro \
  -v taisun_agent_obs-data:/source/obs:ro \
  -v taisun_agent_memory-data:/source/memory:ro \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/taisun-data-$(date +%Y%m%d).tar.gz -C /source .

# Restore from backup
docker run --rm \
  -v taisun_agent_jobs-data:/target/jobs \
  -v taisun_agent_obs-data:/target/obs \
  -v taisun_agent_memory-data:/target/memory \
  -v $(pwd)/backup:/backup:ro \
  alpine tar xzf /backup/taisun-data-YYYYMMDD.tar.gz -C /target
```

## Operations

### Daily Tasks

```bash
# Check DLQ
docker compose -f ops/docker-compose.ops.yml exec proxy \
  npm run jobs:dlq:triage

# Generate daily report
docker compose -f ops/docker-compose.ops.yml exec proxy \
  npm run obs:report:daily
```

### Scaling

Worker can be scaled for higher throughput:

```bash
# Scale to 3 workers
docker compose -f ops/docker-compose.ops.yml up -d --scale worker=3
```

### Troubleshooting

```bash
# View proxy logs
docker compose -f ops/docker-compose.ops.yml logs -f proxy

# View worker logs
docker compose -f ops/docker-compose.ops.yml logs -f worker

# View watcher logs
docker compose -f ops/docker-compose.ops.yml logs -f watcher

# Enter container shell
docker compose -f ops/docker-compose.ops.yml exec proxy sh
```

### Stop Services

```bash
# Stop all services
docker compose -f ops/docker-compose.ops.yml down

# Stop and remove volumes (WARNING: deletes data)
docker compose -f ops/docker-compose.ops.yml down -v
```

## Environment Variables

### Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | 3100 | Server port |
| `LOG_LEVEL` | info | Log verbosity |
| `GITHUB_TOKEN` | - | GitHub API token |
| `NOTION_TOKEN` | - | Notion API token |
| `POSTGRES_DSN` | - | PostgreSQL connection |

### Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_DRY_RUN` | false | Skip actual execution |
| `WORKER_MAX_CONCURRENT` | 3 | Max concurrent jobs |

### Watcher

| Variable | Default | Description |
|----------|---------|-------------|
| `WATCHER_POLL_INTERVAL_MS` | 60000 | Polling interval |
| `WATCHER_REPO` | - | GitHub repo to watch |
| `GITHUB_TOKEN` | - | GitHub API token |

## Security Notes

1. **Never commit `.env.ops`** - contains secrets
2. **Use strong tokens** - rotate regularly
3. **Limit network access** - proxy should only be accessible internally
4. **Review DLQ regularly** - may contain error context

## Related Documentation

- [DLQ Triage Guide](../docs/third-agent/39_DLQ_TRIAGE.md)
- [Execution Plane Architecture](../docs/third-agent/38_EXECUTION_PLANE_ARCHITECTURE.md)
- [Ops Automation](../docs/third-agent/40_OPS_AUTOMATION_JOBS.md)
