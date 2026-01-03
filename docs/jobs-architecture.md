# Jobs Architecture (P12)

## Overview

The Jobs system provides durable job execution with queue management, backpressure, dead-letter queue (DLQ), and automatic approval handling.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Jobs System                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  JobStore    │    │   JobQueue   │    │  JobWorker   │       │
│  │  Service     │◄───│              │◄───│              │       │
│  │              │    │ Backpressure │    │  Executor    │       │
│  │  - inmemory  │    │ DLQ          │    │  --dry-run   │       │
│  │  - jsonl     │    │              │    │              │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   ApprovalWatcher                        │    │
│  │  - GitHub issue polling                                  │    │
│  │  - Auto-resume on approval                               │    │
│  │  - Auto-decline on TTL expiry                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Queue     │────▶│   Worker    │
│ (MCP Call)  │     │  submit()   │     │  getNext()  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  JobStore    │     │  Executor    │
                    │  (persist)   │     │  (Claude)    │
                    └──────────────┘     └──────┬──────┘
                                                │
                           ┌────────────────────┼────────────────────┐
                           ▼                    ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                    │  Succeeded   │     │  Failed      │     │  Waiting     │
                    │              │     │  (retry/DLQ) │     │  Approval    │
                    └──────────────┘     └──────────────┘     └──────┬──────┘
                                                                      │
                                                                      ▼
                                                               ┌──────────────┐
                                                               │  Watcher     │
                                                               │  (poll GH)   │
                                                               └──────────────┘
```

## Job States

```
             ┌─────────────────────────────────────────┐
             │                                         │
             ▼                                         │
┌─────────┐      ┌─────────┐      ┌───────────────────┴─┐
│ queued  │─────▶│ running │─────▶│ waiting_approval    │
└────┬────┘      └────┬────┘      └───────────┬─────────┘
     │                │                       │
     │           ┌────┴────────────┬──────────┤
     │           ▼                 ▼          ▼
     │    ┌───────────┐     ┌───────────┐  (resume)
     │    │ succeeded │     │  failed   │     │
     │    └───────────┘     └─────┬─────┘     │
     │                            │           │
     │                  ┌─────────┴─────────┐ │
     │                  ▼                   │ │
     │           ┌───────────┐              │ │
     └──────────▶│ canceled  │◀─────────────┘ │
                 └───────────┘                │
                       ▲                      │
                       └──────────────────────┘
                            (TTL expired)
```

## Key Concepts

### Idempotency

Jobs are identified by a unique key: `entrypoint:paramsHash[:planHash]`

```typescript
const jobKey = generateJobKey('supervisor', { task: 'deploy' }, 'abc123');
// Result: "supervisor:a1b2c3...:abc123"
```

Creating a job with the same key returns the existing job if it's still active (queued, running, or waiting_approval).

### Priority

Jobs are processed in priority order:
1. `critical` - System-critical operations
2. `high` - Time-sensitive tasks
3. `normal` (default) - Standard tasks
4. `low` - Background tasks

Within the same priority, jobs are processed FIFO (first-in, first-out).

### Backpressure

When queue utilization exceeds the threshold (default 80%), new job submissions are rejected to prevent overload:

```typescript
const queue = new JobQueue(store, {
  maxQueueSize: 100,
  backpressureThreshold: 80, // 80%
});

const result = await queue.submit(job);
if (!result.accepted) {
  console.log(result.reason); // "Queue is under backpressure"
}
```

### Dead-Letter Queue (DLQ)

Jobs that exceed `maxAttempts` are moved to the DLQ:

```typescript
const job = await store.createJob({
  entrypoint: 'supervisor',
  params: { task: 'risky' },
  maxAttempts: 3, // After 3 failures, move to DLQ
});
```

DLQ entries can be:
- Inspected: `queue.getDLQ()`
- Retried: `queue.retryFromDLQ(jobId)`
- Cleared: `queue.clearDLQ()`

### Approval Flow

Jobs requiring human approval:

1. Worker marks job as `waiting_approval` with GitHub issue ID
2. ApprovalWatcher polls GitHub for approval labels
3. On approval: job resumes (back to `queued`)
4. On TTL expiry: job fails automatically

```typescript
// In executor
return {
  success: true,
  needsApproval: 123, // GitHub issue ID
};

// Watcher handles resume/expiry automatically
```

## Configuration

### Jobs Config (`config/proxy-mcp/jobs.json`)

```json
{
  "store": {
    "type": "jsonl",
    "filePath": "./data/jobs.jsonl",
    "autoSaveIntervalMs": 5000
  },
  "queue": {
    "maxConcurrent": 3,
    "maxQueueSize": 100,
    "backpressureThreshold": 80
  },
  "worker": {
    "pollIntervalMs": 1000,
    "maxAttempts": 3,
    "retryDelayMs": 5000
  },
  "approval": {
    "defaultTtlHours": 24,
    "pollIntervalMs": 30000,
    "expiryWarningHours": 1
  },
  "dlq": {
    "enabled": true,
    "maxSize": 1000,
    "retentionDays": 30
  }
}
```

## Integration with system_health

The Jobs system reports statistics via `system_health`:

```typescript
const result = await systemHealth();
console.log(result.data.jobs);
// {
//   store: { queued: 5, running: 2, waiting_approval: 1, ... },
//   queue: { dlq: 0, backpressureActive: false, utilizationPercent: 50 },
//   worker: { processed: 100, succeeded: 95, failed: 5, ... }
// }
```

Health status degradation triggers:
- DLQ size > 10: `degraded`
- Queue utilization > 90%: `degraded`
- Backpressure active: `degraded`

## Testing

### Unit Tests

```bash
npx vitest run tests/unit/jobs-*.test.ts
```

### Dry-Run Mode

```typescript
const worker = new JobWorker(queue, store, { dryRun: true });
// Jobs execute without calling Claude
```

## Files

| File | Description |
|------|-------------|
| `src/proxy-mcp/jobs/types.ts` | Type definitions |
| `src/proxy-mcp/jobs/store.ts` | JobStoreService |
| `src/proxy-mcp/jobs/stores/inmemory.ts` | In-memory adapter |
| `src/proxy-mcp/jobs/stores/jsonl.ts` | JSONL persistent adapter |
| `src/proxy-mcp/jobs/queue.ts` | JobQueue with backpressure/DLQ |
| `src/proxy-mcp/jobs/worker.ts` | JobWorker executor |
| `src/proxy-mcp/jobs/watcher.ts` | ApprovalWatcher |
| `src/proxy-mcp/jobs/index.ts` | Module exports |
| `config/proxy-mcp/jobs.json` | Configuration |
