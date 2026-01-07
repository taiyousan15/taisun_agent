# Mistakes Ledger（ミス台帳）

このファイルは過去のミスと再発防止策を記録する台帳です。
失敗が起きたら必ず追記し、関連タスク開始時に参照します。

---

## 2026-01-07 Mistake: success-true-on-error
- **Symptom**: オプショナル依存エラー時に `success: true` を返していた
- **Root cause**: エラーハンドリングの設計ミス。失敗を成功として報告
- **Where it happened**: `src/proxy-mcp/ops/schedule/runner.ts`
- **Fix**: `success: false, skipped: true` に変更
- **Prevention**:
  - [ ] catch ブロックで success: true を返す前に、本当に成功なのか確認する
  - [ ] オプショナル依存のエラーは skipped フラグで区別する
- **Related constraints**: エラー状態を正確に報告する

---

## 2026-01-07 Mistake: command-injection-vulnerability
- **Symptom**: execSync で文字列補間を使用、コマンドインジェクション脆弱性
- **Root cause**: シェルコマンド構築時のセキュリティ考慮不足
- **Where it happened**: `src/proxy-mcp/supervisor/github.ts` (5箇所)
- **Fix**: execSync → spawnSync + 配列引数に変更
- **Prevention**:
  - [ ] ユーザー入力をシェルコマンドに渡す際は必ず spawnSync + 配列引数を使う
  - [ ] execSync の文字列補間は禁止
- **Related constraints**: OWASP Top 10 準拠

---

## 2026-01-07 Mistake: silent-error-catch
- **Symptom**: catch ブロックでエラーを握りつぶし、デバッグ困難
- **Root cause**: エラーログの欠如
- **Where it happened**: `src/proxy-mcp/browser/cdp/session.ts`
- **Fix**: console.debug でエラーメッセージをログ出力
- **Prevention**:
  - [ ] 空の catch ブロックは禁止
  - [ ] 最低でも debug レベルでエラーをログする
- **Related constraints**: 可観測性の確保

---

## 2026-01-07 Mistake: chrome-origin-wildcard
- **Symptom**: Chrome CDP の --remote-allow-origins=* で全オリジン許可
- **Root cause**: セキュリティ設定の見落とし
- **Where it happened**: `src/proxy-mcp/browser/cdp/chrome-debug-cli.ts`
- **Fix**: localhost のみに制限
- **Prevention**:
  - [ ] ワイルドカード許可は本番環境で使わない
  - [ ] ネットワークアクセス設定はデフォルト deny
- **Related constraints**: 最小権限の原則

---

## 2026-01-07 Mistake: utf8-boundary-crash
- **Symptom**: 日本語/マルチバイト文字を含むファイルの一括置換でクラッシュ（`byte index is not a char boundary`）または文字化け（U+FFFD混入）
- **Root cause**: UTF-8文字列をバイト位置でスライス/置換する処理が文字境界を考慮していない
- **Where it happened**: Claude Code内蔵の一括置換機能（外部要因のため修正不可）
- **Fix**: safe-replace.ts を使用した安全な置換に移行
- **Prevention**:
  - [ ] Claude Code内蔵の一括置換は日本語ファイルに使用禁止
  - [ ] 置換は `npm run text:safe-replace` 経由で実行
  - [ ] 完了前に `npm run text:utf8-guard` で文字化けをチェック
  - [ ] 文字化けが発生したら `git restore` またはバックアップから復旧
- **Related constraints**: 運用手順の遵守、品質ゲートの通過
- **Documentation**: `docs/operations/text-safety-ja.md`
