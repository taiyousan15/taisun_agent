# Evals/Replay Regression Suite Checklist

P10: Pipeline/Router/Supervisor の回帰テスト運用チェックリスト。

## 事前確認

- [ ] Jest evals プロジェクトが設定済み (`jest.config.js` に `displayName: 'evals'`)
- [ ] Fixture ファイルが存在
  - [ ] `tests/fixtures/evals/urls_docs.txt`
  - [ ] `tests/fixtures/evals/urls_ecommerce.txt`
  - [ ] `tests/fixtures/evals/urls_internal.txt`

## Evals テスト実行

### ローカル実行

```bash
# 全 evals テスト実行
npm run test:evals

# カバレッジ付き
npm run test:evals -- --coverage

# JSON出力（レポート生成用）
npm run test:evals -- --json --outputFile=jest-results.json
```

### CI パイプライン

```bash
# 短縮サマリー出力
npm run evals:report:summary

# フルMarkdownレポート生成
npm run evals:report
```

## 契約検証

### Pipeline 契約 (A, B, C)

- [ ] **A)** `mode=tabs` → summary + refId のみ返す（URL リスト露出なし）
- [ ] **B)** `mode=refId` → inputRefId 必須、tabs collection スキップ
- [ ] **C)** `confirmWrite=true` → 承認フロー（dry-run なし）

### Router 契約 (D)

- [ ] deployment → `require_human`
- [ ] destructive → `require_human`
- [ ] secrets → `require_human`
- [ ] billing → `require_human`
- [ ] access_control → `require_human`
- [ ] automation_abuse → `deny`

### Supervisor 契約 (E)

- [ ] 危険パターン検出 → 実行停止
- [ ] リスクレベル判定: low / medium / high / critical
- [ ] critical/high → 承認なしで拒否
- [ ] Resume 用のプラン永続化

## Golden Case 維持

### 新規追加時

1. 適切な fixture ファイルに URL/入力を追加
2. 期待される分類を `test.each` に追加
3. テスト実行で回帰がないことを確認

### False Positive/Negative 発見時

1. Issue を作成（`[BUG] Evals: ...`）
2. 失敗ケースを fixture に追加
3. ルール/パターンを修正
4. 既存テストが壊れていないことを確認

## レポート生成

### Markdown レポート

```bash
# Jest JSON 出力
npm run test:evals -- --json --outputFile=jest-results.json

# レポート生成
npm run evals:report --input jest-results.json --output evals-report.md
```

### CI アーティファクト

GitHub Actions で自動生成:

```yaml
- name: Run Evals
  run: npm run test:evals -- --json --outputFile=jest-results.json

- name: Generate Report
  if: always()
  run: npm run evals:report

- name: Upload Report
  uses: actions/upload-artifact@v4
  with:
    name: evals-report
    path: evals-report.md
```

## トラブルシューティング

### テストがタイムアウト

- モックが正しく設定されているか確認
- CDP/ネットワーク依存が入り込んでいないか確認

### False Negative（検出漏れ）

- `SAFETY_RULES` のパターンを確認
- 大文字/小文字の違いを確認
- パターンが十分に具体的か確認

### False Positive（過検出）

- パターンが広すぎないか確認
- 優先度ルールが正しいか確認

## 関連ドキュメント

- [34_EVALS_REPLAY.md](./34_EVALS_REPLAY.md) - Evals/Replay 設計ドキュメント
- [25_SUPERVISOR.md](./25_SUPERVISOR.md) - Supervisor 設計
- [21_HYBRID_ROUTER.md](./21_HYBRID_ROUTER.md) - Router 設計
