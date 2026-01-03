# Evals/Replay Regression Suite - P10

Pipeline/Router/Supervisor の回帰テストスイート設計。

## 目的

1. **Golden Case による回帰防止**: 安全な入力・危険な入力の分類が壊れないことを保証
2. **契約の明文化**: Pipeline/Router/Supervisor の振る舞いをテストで文書化
3. **CI 統合**: 自動的にレポートを生成し、失敗時に可視化

## アーキテクチャ

```
tests/
├── fixtures/evals/          # Golden Case データ
│   ├── urls_docs.txt        # 安全な URL（ドキュメント系）
│   ├── urls_ecommerce.txt   # E-commerce URL（billing 検出）
│   └── urls_internal.txt    # 内部/管理 URL（require_human 期待）
└── evals/
    ├── pipeline.evals.test.ts   # Pipeline 契約テスト
    ├── router.evals.test.ts     # Router 安全分類テスト
    └── supervisor.evals.test.ts # Supervisor 承認ゲートテスト

src/proxy-mcp/evals/
└── report.ts                # レポート生成ユーティリティ

scripts/evals/
└── generate-report.ts       # CLI レポート生成
```

## 契約 (Contracts)

### Pipeline 契約

| ID | 契約 | 検証方法 |
|----|------|----------|
| A | `mode=tabs` → summary + refId のみ | URL リストが summary に含まれないことを確認 |
| B | `mode=refId` → inputRefId 必須 | tabs collection がスキップされることを確認 |
| C | `confirmWrite=true` → 承認フロー | dry-run フラグが false になることを確認 |

### Router 契約

| ID | 契約 | 検証方法 |
|----|------|----------|
| D | 危険カテゴリ → `require_human` | deployment/destructive/secrets/billing/access_control のパターンを検証 |
| - | automation_abuse → `deny` | deny が require_human より優先されることを確認 |

### Supervisor 契約

| ID | 契約 | 検証方法 |
|----|------|----------|
| E | 危険パターン → 実行停止 | checkDangerousPatterns が非空配列を返すことを確認 |
| - | high/critical → 承認なしで拒否 | validatePlan が valid=false を返すことを確認 |
| - | Resume 可能 | プランが JSON シリアライズ可能であることを確認 |

## リスクレベル

| Level | 例 | 承認要否 |
|-------|-----|----------|
| `low` | read, list, get | 不要 |
| `medium` | grant admin, change permission | プランに応じて |
| `high` | update secret, cancel payment | 必須 |
| `critical` | delete database, deploy production | 必須（自動拒否） |

## テスト実行

```bash
# 全 evals 実行
npm run test:evals

# 特定のテストファイル
npm run test:evals -- --testPathPattern=router

# JSON 出力（CI用）
npm run test:evals -- --json --outputFile=jest-results.json
```

## レポート生成

```bash
# Markdown レポート生成
npm run evals:report

# CI サマリーのみ
npm run evals:report:summary
```

### 出力例

```markdown
# Evals Report

**Generated:** 2025-01-03T10:00:00.000Z
**Duration:** 5s

## Summary

✅ All 84 tests passed

| Metric | Value |
|--------|-------|
| Total Tests | 84 |
| Passed | 84 |
| Failed | 0 |

## Contracts Verified

- **Pipeline:** summary+refId output, confirmWrite approval flow
- **Router:** deployment/destructive/secrets/billing/access_control → require_human
- **Supervisor:** dangerous patterns stop execution, resume capability
```

## モック戦略

Evals テストは **ネットワーク/CDP 依存なし** で動作:

```typescript
// CDP をモック
jest.mock('../../src/proxy-mcp/browser/cdp', () => ({
  listTabsViaCDP: jest.fn(),
}));

// Memory をモック
jest.mock('../../src/proxy-mcp/tools/memory', () => ({
  memoryAdd: jest.fn(),
}));
```

## Golden Case 管理

### Fixture フォーマット

```
# コメント行（#で始まる）
https://example.com/safe-url
https://example.com/another-safe-url
```

### 新規 Golden Case 追加

1. 適切な fixture ファイルに追加
2. `test.each` に期待される分類を追加
3. テスト実行で回帰がないことを確認

## CI 統合

```yaml
# .github/workflows/evals.yml
name: Evals
on: [push, pull_request]

jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:evals -- --json --outputFile=jest-results.json
      - run: npm run evals:report
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: evals-report
          path: evals-report.md
```

## 関連ドキュメント

- [20_CHECKLIST_EVALS_REPLAY.md](./20_CHECKLIST_EVALS_REPLAY.md) - 運用チェックリスト
- [25_SUPERVISOR.md](./25_SUPERVISOR.md) - Supervisor 設計
- [21_HYBRID_ROUTER.md](./21_HYBRID_ROUTER.md) - Hybrid Router 設計
