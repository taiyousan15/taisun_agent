# MCP Catalog Governance - P9

MCPカタログの管理と本番有効化のガバナンスルール。

## Overview

MCPカタログシステムは2つの明確なフェーズに分離:

1. **Catalog Phase**: 候補の収集・評価・無効化スタブ生成
2. **Enable Phase**: Phase 6 ロールアウトによる段階的有効化

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MCP CATALOG GOVERNANCE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   CATALOG PHASE (Safe)                 ENABLE PHASE (Controlled)   │
│   ┌─────────────────────┐             ┌─────────────────────┐      │
│   │  awesome lists      │             │  Phase 6 Rollout    │      │
│   │       ↓             │             │  ┌─────────────┐    │      │
│   │  Import → Score     │   ───────→  │  │ Canary (1%) │    │      │
│   │       ↓             │   Approval  │  │     ↓       │    │      │
│   │  Disabled Stubs     │   Required  │  │ Rollout     │    │      │
│   │  (catalog.json)     │             │  │     ↓       │    │      │
│   └─────────────────────┘             │  │ Observability│   │      │
│                                        │  └─────────────┘    │      │
│   ✓ Safe to commit                    │  ✓ Controlled rollout│     │
│   ✓ No credentials                    │  ✓ Rollback ready    │     │
│   ✓ All disabled                      │  ✓ Metrics tracked   │     │
│                                        └─────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Catalog Phase

### 1. Import (候補収集)

```bash
# awesome listsからインポート（CLIまたはfixture）
npm run mcp-catalog:import -- --source awesome-mcp-servers
```

- 外部ソースからMCP候補をインポート
- `catalog/mcp/catalog.json` に保存
- ソースメタデータを保持

### 2. Score (評価)

```typescript
import { scoreCatalog } from './src/proxy-mcp/catalog';

const scored = scoreCatalog(entries, config, overrides);
```

**スコアリング基準:**

| Category | Bonus/Penalty |
|----------|---------------|
| browser | +20 |
| web-api | +15 |
| database | +10 |
| cloud | -5 |
| security | -10 |
| dangerous | -50 |

**リスクパターン:**

| Pattern | Level | Penalty |
|---------|-------|---------|
| root/admin/sudo | critical | -100 |
| shell/exec | high | -50 |
| delete/destroy | high | -30 |
| credential/secret | high | -20 |
| write/modify | medium | -10 |

### 3. Generate Stubs (無効化スタブ生成)

```bash
# 無効化スタブを生成
npm run mcp-catalog:generate-stubs
```

**出力:** `config/proxy-mcp/internal-mcps.local.example.generated.json`

- **必ず `enabled: false`**
- 実際のクレデンシャルなし（プレースホルダのみ）
- Phase 6設計に合わせたtimeout/retry設定

## Enable Phase

### Phase 6 Rollout（有効化）

**重要:** カタログにあるからといって自動有効化しない。

```
1. Canary (1%): 限定環境でテスト
2. Gradual Rollout: 段階的に拡大
3. Observability: メトリクス監視
4. Rollback Ready: 問題時の即座ロールバック
```

### 有効化チェックリスト

- [ ] Phase 6チェックリストを完了
- [ ] 必要なクレデンシャルを安全に設定（環境変数）
- [ ] `enabled: true` に変更
- [ ] Canaryテスト完了
- [ ] 監視ダッシュボード確認
- [ ] Rollback手順確認

## Security Rules

### 絶対禁止

1. **実クレデンシャルのコミット**
   - API keys, tokens, secretsは `.env.local` のみ
   - `.gitignore` で除外確認

2. **カタログからの自動有効化**
   - カタログ = 候補リスト（disabled）
   - 有効化 = Phase 6ロールアウト必須

3. **高リスクMCPの無断有効化**
   - `requireHuman: true` のMCPは承認必須
   - `blocked: true` のMCPは有効化不可

### 推奨プラクティス

1. **段階的追加**
   - 一度に大量有効化しない
   - 1-2個ずつ追加・検証

2. **監視設定**
   - 新規MCPには必ずアラート設定
   - エラー率・レイテンシ監視

3. **Rollback準備**
   - 有効化前にRollback手順確認
   - 問題時は即座にRollback

## Files

| File | Description |
|------|-------------|
| `catalog/mcp/sources.json` | インポートソース定義 |
| `catalog/mcp/catalog.json` | 候補カタログ |
| `catalog/mcp/overrides.json` | スコア調整 |
| `src/proxy-mcp/catalog/` | カタログモジュール |
| `config/proxy-mcp/internal-mcps.local.example.generated.json` | 生成されたスタブ |

## Related

- [12_CHECKLIST_ADD_INTERNAL_MCP.md](./12_CHECKLIST_ADD_INTERNAL_MCP.md) - 内部MCP追加チェックリスト
- [13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md](./13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md) - 本番有効化チェックリスト
- [14_CHECKLIST_ROLLBACK_INTERNAL_MCP.md](./14_CHECKLIST_ROLLBACK_INTERNAL_MCP.md) - ロールバックチェックリスト
