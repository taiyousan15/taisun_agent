# MCP Catalog Checklist - P9

MCPカタログ操作のためのチェックリスト。

## Import Checklist

### 新規ソースの追加

- [ ] `catalog/mcp/sources.json` にソース定義を追加
  - `id`: 一意の識別子
  - `url`: Markdownファイルの直接URL
  - `type`: "markdown"
  - `enabled`: true/false

- [ ] サンプルデータでパース確認
  ```bash
  # フィクスチャを使ったテスト
  npm test -- --testPathPattern=mcp-catalog-importer
  ```

- [ ] カテゴリ推論が適切か確認
  - `browser`, `database`, `web-api` など適切にマッピングされているか

### インポート実行

- [ ] ネットワーク接続確認（ローカル開発時のみ）
- [ ] `npm run mcp-catalog:import` 実行
- [ ] `catalog/mcp/catalog.json` 更新確認
- [ ] エントリ数と内容を目視確認

## Scoring Checklist

### スコア調整

- [ ] `catalog/mcp/overrides.json` でカスタム調整
  ```json
  {
    "overrides": {
      "target-mcp-id": {
        "scoreAdjustment": 10,
        "reason": "Priority for our use case"
      }
    }
  }
  ```

- [ ] リスクレベルが適切に検出されているか確認
  - `critical`: root, admin, sudo
  - `high`: shell, exec, delete, destroy
  - `medium`: write, modify, cloud
  - `low`: read-only, fetch

- [ ] `requireHuman` フラグが高リスクMCPに設定されているか
- [ ] `blocked` フラグが危険なMCPに設定されているか

### スコアリングテスト

- [ ] テスト実行
  ```bash
  npm test -- --testPathPattern=mcp-catalog-score
  ```

- [ ] 統計確認
  - カテゴリ別分布
  - リスクレベル別分布
  - 平均スコア

## Stub Generation Checklist

### スタブ生成

- [ ] `npm run mcp-catalog:generate-stubs` 実行
- [ ] 出力ファイル確認: `config/proxy-mcp/internal-mcps.local.example.generated.json`

### 生成されたスタブの確認

- [ ] **全てのエントリが `enabled: false`**
- [ ] **実クレデンシャルが含まれていない**（プレースホルダのみ）
- [ ] `timeout` と `retry` が適切に設定されている
- [ ] `requiredEnv` がプレースホルダとして含まれている

### コミット前チェック

- [ ] `.env*` ファイルが `.gitignore` に含まれている
- [ ] 実際のAPI key/tokenが含まれていない
- [ ] `grep -r "sk-" config/` でシークレットがないことを確認
- [ ] `grep -r "ghp_" config/` でGitHubトークンがないことを確認

## Enable Workflow Checklist

**注意:** このチェックリストはカタログからの有効化用。
詳細は [13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md](./13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md) を参照。

### Phase 6 Rollout前

- [ ] カタログエントリのリスクレベル確認
- [ ] `requireHuman: true` の場合は承認取得
- [ ] `blocked: true` の場合は有効化不可

### 有効化手順

1. [ ] 生成されたスタブをコピー
   ```bash
   # 対象MCPのスタブをコピー
   jq '.["target-mcp"]' internal-mcps.local.example.generated.json
   ```

2. [ ] `config/proxy-mcp/internal-mcps.local.json` に追加

3. [ ] 環境変数を `.env.local` に設定
   ```bash
   # requiredEnv の値を実際の値で設定
   TARGET_MCP_API_KEY=actual-key-here
   ```

4. [ ] `enabled: true` に変更

5. [ ] Canaryテスト
   ```bash
   npm run proxy:smoke
   ```

6. [ ] 監視確認
   - エラー率
   - レイテンシ
   - 呼び出し回数

7. [ ] 問題があればRollback
   - `enabled: false` に戻す
   - 環境変数を削除

## CI/CD Integration

### テスト

```bash
# 全カタログテスト
npm test -- --testPathPattern=mcp-catalog

# カバレッジ付き
npm run test:coverage -- --testPathPattern=mcp-catalog
```

### 検証コマンド

```bash
# Unicode検証（CI）
npm run check:unicode

# 型チェック
npx tsc --noEmit

# Lint
npm run lint
```

## Security Rules Summary

| Rule | Description |
|------|-------------|
| 実クレデンシャル禁止 | `.env.local` のみに保存、コミット禁止 |
| カタログは常にdisabled | 有効化はPhase 6経由のみ |
| 高リスク要承認 | `requireHuman: true` は人間承認必須 |
| blocked有効化禁止 | `blocked: true` のMCPは有効化不可 |

## Related Documents

- [35_TOOL_GOVERNANCE_CATALOG.md](./35_TOOL_GOVERNANCE_CATALOG.md) - ガバナンスルール
- [12_CHECKLIST_ADD_INTERNAL_MCP.md](./12_CHECKLIST_ADD_INTERNAL_MCP.md) - 内部MCP追加
- [13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md](./13_CHECKLIST_ENABLE_INTERNAL_MCP_PROD.md) - 本番有効化
- [14_CHECKLIST_ROLLBACK_INTERNAL_MCP.md](./14_CHECKLIST_ROLLBACK_INTERNAL_MCP.md) - ロールバック
