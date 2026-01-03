# P15: SLO Scheduler

## Overview

SLO Scheduler は、P14 で実装した SLO 評価とアラート投稿を定期的に自動実行するデーモンです。

## Features

### 定期実行
- 設定可能な間隔（デフォルト: 5分）で SLO チェックを実行
- Docker Compose で常時稼働

### 重複排除（Deduplication）
- ステータスが変わらない場合は投稿をスキップ
- 連続した同じアラートのスパムを防止

### クールダウン
- WARN: 120分（デフォルト）
- CRITICAL: 30分（デフォルト）
- 同じステータスでも間隔を空けて再投稿

### 復旧通知
- WARN/CRITICAL → OK に戻った時に復旧通知を投稿
- 設定で無効化可能（`postOnRecovery: false`）

### 状態永続化
- 最後のステータス、投稿時刻を JSON ファイルに保存
- コンテナ再起動後も状態を引き継ぎ

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SLO Scheduler                          │
├──────────────────┬──────────────────────────────────────┤
│    run-loop.ts   │  Continuous loop with interval        │
├──────────────────┼──────────────────────────────────────┤
│   run-once.ts    │  Single cycle: evaluate + decide      │
├──────────────────┼──────────────────────────────────────┤
│    state.ts      │  State persistence + cooldown logic   │
├──────────────────┼──────────────────────────────────────┤
│    types.ts      │  Type definitions                     │
└──────────────────┴──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   P14 SLO Module                         │
├──────────────────┬──────────────────────────────────────┤
│   evaluate.ts    │  Collect metrics + evaluate SLOs     │
├──────────────────┼──────────────────────────────────────┤
│    post.ts       │  Post alerts to GitHub               │
└──────────────────┴──────────────────────────────────────┘
```

## Configuration

### `config/proxy-mcp/slo-scheduler.json`

```json
{
  "version": "1.0.0",
  "scheduler": {
    "intervalSeconds": 300,
    "cooldown": {
      "warnMinutes": 120,
      "criticalMinutes": 30
    },
    "postOnRecovery": true,
    "enabled": true
  },
  "alerts": {
    "targetIssueNumber": null,
    "owner": "taiyousan15",
    "repo": "taisun_agent"
  },
  "stateFile": ".taisun/slo-scheduler-state.json"
}
```

### Environment Variables (Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_INTERVAL_SECONDS` | 300 | チェック間隔（秒） |
| `SCHEDULER_COOLDOWN_WARN_MINUTES` | 120 | WARN クールダウン（分） |
| `SCHEDULER_COOLDOWN_CRITICAL_MINUTES` | 30 | CRITICAL クールダウン（分） |
| `SCHEDULER_POST_ON_RECOVERY` | true | 復旧時に投稿するか |
| `SCHEDULER_TARGET_ISSUE` | - | コメント先の Issue 番号 |

## Usage

### CLI

```bash
# 一度だけ実行
npm run ops:slo:scheduler

# 継続実行（ループモード）
npm run ops:slo:scheduler:loop

# ドライラン（投稿しない）
npm run ops:slo:scheduler -- --dry-run

# 詳細出力
npm run ops:slo:scheduler -- --verbose
```

### Docker Compose

```bash
# 全サービス起動（scheduler 含む）
docker compose -f ops/docker-compose.ops.yml up -d

# scheduler ログ確認
docker compose -f ops/docker-compose.ops.yml logs -f scheduler

# scheduler のみ再起動
docker compose -f ops/docker-compose.ops.yml restart scheduler
```

## Decision Logic

```
Check SLO
    │
    ├─ Status = OK
    │   │
    │   ├─ Previous ≠ OK && postOnRecovery → POST recovery alert
    │   │
    │   └─ Otherwise → SKIP
    │
    └─ Status = WARN or CRITICAL
        │
        ├─ Status changed → POST alert
        │
        └─ Status unchanged
            │
            ├─ Cooldown active → SKIP
            │
            └─ Cooldown elapsed → POST alert
```

## Files

| Path | Description |
|------|-------------|
| `config/proxy-mcp/slo-scheduler.json` | 設定ファイル |
| `config/proxy-mcp/slo-scheduler.schema.json` | JSON Schema |
| `src/proxy-mcp/ops/scheduler/types.ts` | 型定義 |
| `src/proxy-mcp/ops/scheduler/state.ts` | 状態管理 |
| `src/proxy-mcp/ops/scheduler/run-once.ts` | 単発実行 |
| `src/proxy-mcp/ops/scheduler/run-loop.ts` | ループ実行 |
| `scripts/ops/slo-scheduler.ts` | CLI エントリポイント |

## Observability Events

| Event | Description |
|-------|-------------|
| `slo_checked` | SLO 評価完了 |
| `slo_alert_posted` | アラート投稿成功 |
| `slo_alert_suppressed` | アラート抑制（重複/クールダウン） |
| `slo_recovered` | 復旧検知 |

## Related

- [41_SLO_ALERTS.md](./41_SLO_ALERTS.md) - P14 SLO & Alerts
- [26_CHECKLIST_SLO_ALERTS.md](./26_CHECKLIST_SLO_ALERTS.md) - P14 チェックリスト
- [40_OPS_AUTOMATION_JOBS.md](./40_OPS_AUTOMATION_JOBS.md) - P13 Ops Automation
