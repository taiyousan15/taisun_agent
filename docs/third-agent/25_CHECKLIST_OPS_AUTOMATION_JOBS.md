# Checklist: P13 Ops Automation for Jobs

## Pre-deployment

- [ ] Review `.env.ops.example` and understand required variables
- [ ] Obtain GitHub token with `repo` scope
- [ ] (Optional) Obtain Notion token if using notion-knowledge-mcp
- [ ] (Optional) Obtain PostgreSQL DSN if using postgres-mcp-analyst

## Configuration

- [ ] Copy `ops/.env.ops.example` to `ops/.env.ops`
- [ ] Set `GITHUB_TOKEN` in `.env.ops`
- [ ] Set `WATCHER_REPO` to your repository (owner/repo format)
- [ ] Configure optional service tokens as needed
- [ ] Verify `.env.ops` is in `.gitignore` (should be)

## Deployment

- [ ] Build Docker images: `docker compose -f ops/docker-compose.ops.yml build`
- [ ] Start services: `docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops up -d`
- [ ] Verify proxy health: `curl http://localhost:3100/health`
- [ ] Check all containers running: `docker compose -f ops/docker-compose.ops.yml ps`
- [ ] Tail logs for errors: `docker compose -f ops/docker-compose.ops.yml logs -f`

## Verification

- [ ] Submit a test job and verify it's queued
- [ ] Check job appears in `system_health` output
- [ ] Verify DLQ triage works: `npm run jobs:dlq:triage`
- [ ] Generate a test report: `npm run obs:report:daily`
- [ ] Report contains "Job実行状態" section
- [ ] (If DLQ has items) Failure reasons are redacted properly

## Daily Operations

- [ ] Set up daily report cron job (or manual check)
- [ ] Configure DLQ monitoring alerts (optional)
- [ ] Document triage process for team
- [ ] Test backup/restore procedure

## Rollback

If issues occur:

1. [ ] Stop services: `docker compose -f ops/docker-compose.ops.yml down`
2. [ ] Check logs for root cause
3. [ ] Fix configuration or code
4. [ ] Restart services

## Post-deployment

- [ ] Monitor first 24h for unexpected errors
- [ ] Review first daily report
- [ ] Verify watcher is polling approvals correctly
- [ ] Document any environment-specific configurations

## Security Verification

- [ ] `.env.ops` is not committed to git
- [ ] Tokens have minimal required permissions
- [ ] DLQ triage output doesn't leak secrets (test with fake sensitive data)
- [ ] Proxy is not exposed to public internet (internal only)
