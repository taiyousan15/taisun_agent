# 第三エージェント統合ドキュメント（ガバナンス）

このフォルダは、MCPツールが **100個以上** に増える前提で、
「会話（コンテキスト）の圧迫」を避けながら、ブラウザ操作・Web解析・RAG/DB操作を **安全に自動化** するための
**運用ルール（ガバナンス）** をまとめた場所です。

## ここにあるもの
- `00_RUNBOOK_0-12.md`
  0〜12の「やること」を、迷わないように一本化した手順書（文章完成版）
- `10_CHECKLIST_ADD_MCP.md`
  新しいMCPサーバー/ツールを追加するときのチェックリスト
- `11_CHECKLIST_ADD_SKILL.md`
  新しいスキルを追加するときのチェックリスト
- `12_CHECKLIST_ADD_INTERNAL_MCP.md`
  **Phase 5: 内部MCP追加チェックリスト** - 安全な内部MCP追加手順
- `26_PROXY_SINGLE_ENTRYPOINT.md`
  **Phase 4: Proxy 1本化設計** - Claude が接続する MCP は `taisun-proxy` のみ
- `27_INTERNAL_MCP_ADD_STANDARD.md`
  **Phase 5: 内部MCP追加標準** - 内部MCPの追加・管理・観測の標準手順

## 最低限のルール（毎回これだけは守る）
1. 作業開始前に **GitHub Issue** を作る（Issueテンプレを使う）
2. **壊れない** が最優先。作業は小さく分け、必ず `npm test / lint / typecheck` を通す
3. MCPツールはむやみにClaude側へ増やさない
   → **Proxy（受付）で隠し、必要なときだけ使う**（会話が重くならない）
4. **通常は `.mcp.json` は proxy-only** を維持する（[26_PROXY_SINGLE_ENTRYPOINT.md](./26_PROXY_SINGLE_ENTRYPOINT.md) 参照）

## 関連
- Issueテンプレ: `.github/ISSUE_TEMPLATE/agent-run-log.yml`
