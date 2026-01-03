# Jobs Runbook (P12)

## Quick Reference

| Issue | Check | Action |
|-------|-------|--------|
| DLQ filling up | `system_health` → jobs.queue.dlq | See [DLQ Resolution](#dlq-resolution) |
| Backpressure active | `system_health` → jobs.queue.backpressureActive | See [Backpressure](#backpressure-handling) |
| Jobs stuck in waiting | `system_health` → jobs.store.waiting_approval | See [Approval Issues](#approval-issues) |
| Worker not processing | `system_health` → jobs.worker.currentJob | See [Worker Issues](#worker-issues) |

## DLQ Resolution

### Check DLQ Status

```typescript
// Via system_health
const health = await systemHealth();
console.log(health.data.jobs.queue.dlq); // Number of DLQ entries

// Or directly
const dlq = queue.getDLQ();
console.log(dlq.length);
```

### Inspect DLQ Entries

```typescript
const dlq = queue.getDLQ();
for (const entry of dlq) {
  console.log({
    jobId: entry.job.id,
    entrypoint: entry.job.entrypoint,
    reason: entry.reason,
    addedAt: entry.addedAt,
    attempts: entry.job.attempts,
    lastError: entry.job.lastError,
  });
}
```

### Resolution Options

#### 1. Retry Individual Jobs

```typescript
// Retry specific job
const newJob = await queue.retryFromDLQ(jobId);
if (newJob) {
  console.log(`Created new job: ${newJob.id}`);
}
```

#### 2. Retry All DLQ Jobs

```typescript
const dlq = queue.getDLQ();
for (const entry of dlq) {
  try {
    await queue.retryFromDLQ(entry.job.id);
    console.log(`Retried: ${entry.job.id}`);
  } catch (err) {
    console.error(`Failed to retry ${entry.job.id}:`, err);
  }
}
```

#### 3. Clear DLQ (Drop Jobs)

```typescript
// Clear all DLQ entries (jobs are lost)
queue.clearDLQ();
```

#### 4. Clean Expired Entries

```typescript
// Remove entries older than retention period
const removed = queue.cleanExpiredDLQ();
console.log(`Removed ${removed} expired entries`);
```

### Common DLQ Causes

| Cause | Symptoms | Fix |
|-------|----------|-----|
| Transient API errors | Multiple jobs with same error | Wait and retry |
| Invalid parameters | Job-specific errors | Fix params, retry with new job |
| Resource exhaustion | Timeout errors | Increase limits or retry later |
| External service down | Connection errors | Wait for service recovery |

## Backpressure Handling

### Detection

```typescript
const stats = await queue.getStats();
if (stats.backpressureActive) {
  console.log(`Queue utilization: ${stats.utilizationPercent}%`);
}
```

### Resolution Options

#### 1. Wait for Processing

Jobs will process automatically. Monitor with:

```typescript
// Check every 10 seconds
setInterval(async () => {
  const stats = await queue.getStats();
  console.log(`Queued: ${stats.queued}, Running: ${stats.running}`);
}, 10000);
```

#### 2. Cancel Low-Priority Jobs

```typescript
const jobs = await store.list({
  status: 'queued',
  orderBy: 'priority',
  orderDir: 'desc', // Low priority first
});

for (const job of jobs.filter(j => j.priority === 'low')) {
  await queue.cancel(job.id, 'Backpressure relief');
}
```

#### 3. Increase Capacity

Temporarily increase limits:

```typescript
// In config/proxy-mcp/jobs.json
{
  "queue": {
    "maxConcurrent": 5,   // Increase from 3
    "maxQueueSize": 200   // Increase from 100
  }
}
```

## Approval Issues

### Check Waiting Jobs

```typescript
const waiting = await store.getWaitingApprovalJobs();
for (const job of waiting) {
  console.log({
    id: job.id,
    issueId: job.issueId,
    expiresAt: job.approvalExpiresAt,
  });
}
```

### Check Expiring Jobs

```typescript
const expiring = await watcher.getExpiringJobs();
for (const job of expiring) {
  console.log(`Job ${job.id} expires at ${job.approvalExpiresAt}`);
}
```

### Manual Approval Check

```typescript
// Force check specific job
const result = await watcher.forceCheck(jobId);
if (result?.approved) {
  console.log('Job has been approved and resumed');
} else if (result?.expired) {
  console.log('Job has expired and been failed');
}
```

### GitHub CLI Verification

```bash
# Check if gh is authenticated
gh auth status

# Check specific issue labels
gh issue view <issue-id> --json labels

# Manually approve
gh issue edit <issue-id> --add-label approved
```

## Worker Issues

### Check Worker Status

```typescript
const stats = worker.getStats();
console.log({
  running: worker.isRunning(),
  currentJob: stats.currentJob,
  processed: stats.processed,
  succeeded: stats.succeeded,
  failed: stats.failed,
  uptimeMs: stats.uptimeMs,
});
```

### Worker Not Processing

1. **Check if started:**
   ```typescript
   if (!worker.isRunning()) {
     worker.start();
   }
   ```

2. **Check for stuck job:**
   ```typescript
   const stats = worker.getStats();
   if (stats.currentJob) {
     const job = await store.getJob(stats.currentJob);
     console.log(`Stuck on job: ${job?.id}, started at: ${job?.startedAt}`);
   }
   ```

3. **Check queue status:**
   ```typescript
   const queueStats = await queue.getStats();
   console.log(`Queued: ${queueStats.queued}`);
   ```

### Restart Worker

```typescript
await worker.stop();
// Wait a moment
await new Promise(r => setTimeout(r, 1000));
worker.start();
```

## Store Issues

### Verify Store State

```typescript
const stats = await store.getStats();
console.log(stats);
// { queued: 5, running: 2, waiting_approval: 1, ... }
```

### JSONL Store Issues

```bash
# Check store file
ls -la ./data/jobs.jsonl

# View recent entries
tail -10 ./data/jobs.jsonl

# Verify JSON format
jq '.' ./data/jobs.jsonl
```

### Force Save

```typescript
// For JSONL store
const adapter = store.getAdapter() as JsonlJobStore;
await adapter.forceSave();
```

## Monitoring

### Health Endpoint

The `system_health` tool includes jobs statistics:

```typescript
const health = await systemHealth();
const jobs = health.data.jobs;

// Check for issues
if (jobs.queue.backpressureActive) {
  console.warn('Backpressure active!');
}
if (jobs.queue.dlq > 10) {
  console.warn(`DLQ has ${jobs.queue.dlq} entries!`);
}
if (jobs.queue.utilizationPercent > 90) {
  console.warn(`High queue utilization: ${jobs.queue.utilizationPercent}%`);
}
```

### Key Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Queue utilization | < 70% | 70-90% | > 90% |
| DLQ size | 0 | 1-10 | > 10 |
| Backpressure | false | - | true |
| Worker uptime | > 0 | - | 0 (not running) |

### Events

The queue emits events for monitoring:

```typescript
queue.on('job:started', (job) => log.info(`Started: ${job.id}`));
queue.on('job:succeeded', (jobId) => log.info(`Succeeded: ${jobId}`));
queue.on('job:failed', (jobId, error) => log.error(`Failed: ${jobId}`, error));
queue.on('job:dlq', (jobId, reason) => log.warn(`DLQ: ${jobId}`, reason));
queue.on('job:retrying', (jobId) => log.info(`Retrying: ${jobId}`));
```

## Emergency Procedures

### Clear All Jobs

```bash
# Stop worker first
# Then clear store
rm ./data/jobs.jsonl
```

### Disable Job System

Set in config:

```json
{
  "worker": {
    "enabled": false
  }
}
```

### Force Fail All Running Jobs

```typescript
const running = await store.getRunningJobs();
for (const job of running) {
  await store.failJob(job.id, 'Emergency shutdown');
}
```
