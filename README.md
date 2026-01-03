# TAISUN v2

**Unified Development System** - 世界最高品質のシステム開発を実現する統合開発プラットフォーム

[![CI](https://github.com/taiyousan15/taisun_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/taiyousan15/taisun_agent/actions/workflows/ci.yml)
[![Security](https://github.com/taiyousan15/taisun_agent/actions/workflows/security.yml/badge.svg)](https://github.com/taiyousan15/taisun_agent/actions/workflows/security.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 概要

TAISUN v2は、**75の専門エージェント**、**51のスキル**、**73のコマンド**、**32のMCPサーバー**、**227のMCPツール**を統合した世界最高品質の開発・マーケティング統合システムです。
Claude Codeと連携し、設計から実装、テスト、デプロイ、さらにマーケティングまでを一貫して支援します。

### 主な機能

- **マルチエージェントシステム**: 75種類の専門エージェント（AIT42 + Miyabi）が協調して作業
- **スキルライブラリ**: マーケティング(15)、コンテンツ制作(10)、AI画像/動画(5)、Video Agent(10)、インフラ(11)
- **品質ゲート**: 80%カバレッジ、セキュリティスキャン自動化
- **MCP統合**: PostgreSQL、Notion、GitHub等との連携
- **メモリシステム**: エージェント学習と品質追跡

## クイックスタート

### 前提条件

- Node.js 18.x 以上
- npm 9.x 以上
- Claude Code CLI

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/taiyousan15/taisun_agent.git
cd taisun_agent

# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .env を編集してAPIキー等を設定
```

### 動作確認

```bash
# テスト実行
npm test

# Lint実行
npm run lint

# 型チェック
npm run typecheck
```

## 基本的な使い方

### エージェントを呼び出す

```javascript
// システムアーキテクチャ設計
Task(subagent_type="system-architect", prompt="ECサイトのアーキテクチャを設計して")

// バックエンド実装
Task(subagent_type="backend-developer", prompt="ユーザー認証APIを実装して")

// コードレビュー
Task(subagent_type="code-reviewer", prompt="このPRをレビューして")

// テスト生成
Task(subagent_type="test-generator", prompt="src/app.ts のテストを作成して")
```

### スキルを実行する

```bash
# セールスレター作成
/sales-letter --product "オンライン講座"

# LP分析
/lp-analysis https://example.com

# 画像プロンプト生成
/nanobanana-prompts YouTubeサムネイル用プロンプトを生成して

# セキュリティスキャン
/security-scan-trivy
```

### コーディネーターを使う

```javascript
// 最適なエージェントを自動選択
Task(subagent_type="ait42-coordinator", prompt="ユーザー認証機能を設計・実装して")

// 軽量版（高速）
Task(subagent_type="ait42-coordinator-fast", prompt="簡単なバグを修正して")
```

## エージェント一覧

### カテゴリ別エージェント数

| カテゴリ | 数 | 主なエージェント |
|---------|---|-----------------|
| Coordinators | 4 | ait42-coordinator, omega-aware-coordinator |
| Architecture | 6 | system-architect, api-designer, database-designer |
| Development | 6 | backend-developer, frontend-developer, api-developer |
| Quality Assurance | 8 | code-reviewer, test-generator, security-tester |
| Operations | 8 | devops-engineer, cicd-manager, monitoring-specialist |
| Documentation | 3 | tech-writer, doc-reviewer, knowledge-manager |
| Analysis | 4 | complexity-analyzer, feedback-analyzer |
| Specialized | 5 | bug-fixer, refactor-specialist, feature-builder |
| Multi-Agent | 4 | multi-agent-competition, multi-agent-debate |
| Process | 5 | workflow-coordinator, requirements-elicitation |

詳細は [docs/API_REFERENCE.md](docs/API_REFERENCE.md) を参照してください。

## スキル一覧

### Marketing & Content (11種)

| スキル | 説明 |
|--------|------|
| `copywriting-helper` | コピーライティング支援 |
| `sales-letter` | セールスレター作成 |
| `step-mail` | ステップメール作成 |
| `vsl` | ビデオセールスレター |
| `launch-video` | ローンチ動画スクリプト |
| `lp-generator` | LP作成 (PASCOLA/漫画) |
| `funnel-builder` | ファネル構築 |
| `mendan-lp` | 面談LP作成 |
| `lp-analysis` | LP分析・最適化 |
| `customer-support` | カスタマーサポート返信 |
| `tommy-style` | トミースタイル適用 |

### Creative & Media (3種)

| スキル | 説明 |
|--------|------|
| `gemini-image-generator` | 画像生成 (NanoBanana統合) |
| `nanobanana-prompts` | プロンプト最適化 |
| `japanese-tts-reading` | 日本語TTS |

### Infrastructure (9種)

| スキル | 説明 |
|--------|------|
| `workflow-automation-n8n` | n8nワークフロー |
| `docker-mcp-ops` | Dockerオペレーション |
| `security-scan-trivy` | セキュリティスキャン |
| `pdf-automation-gotenberg` | PDF自動化 |
| `doc-convert-pandoc` | ドキュメント変換 |
| `unified-notifications-apprise` | 通知統合 |
| `postgres-mcp-analyst` | PostgreSQL分析 |
| `notion-knowledge-mcp` | Notionナレッジ |
| `nlq-bi-wrenai` | 自然言語BI |

### Research (1種)

| スキル | 説明 |
|--------|------|
| `research-cited-report` | 出典付きリサーチレポート |

## プロジェクト構造

```
taisun_v2/
├── .claude/
│   ├── CLAUDE.md           # プロジェクト指示書
│   ├── settings.json       # パーミッション設定
│   ├── agents/             # 69エージェント定義
│   ├── commands/           # コマンド定義
│   ├── skills/             # 24スキル定義
│   └── memory/             # 学習・統計システム
├── .github/
│   ├── workflows/          # CI/CDワークフロー
│   │   ├── ci.yml          # 継続的インテグレーション
│   │   ├── cd.yml          # 継続的デプロイ
│   │   └── security.yml    # セキュリティスキャン
│   ├── ISSUE_TEMPLATE/     # Issueテンプレート
│   └── dependabot.yml      # 依存関係自動更新
├── src/                    # ソースコード
├── docs/                   # ドキュメント
├── scripts/                # ユーティリティ
└── config/                 # 設定ファイル
```

## 品質ゲート

| 項目 | 基準 |
|------|------|
| コードレビュースコア | 80点以上 |
| テストカバレッジ | 80%以上 |
| セキュリティスキャン | Critical/High ゼロ |

## CI/CD

### 自動実行されるチェック

| チェック | トリガー |
|---------|---------|
| Lint & TypeScript | Push/PR |
| ユニットテスト | Push/PR |
| セキュリティスキャン | Push/PR, 週次 |
| ビルド | Push/PR |

### デプロイフロー

```
develop → ステージング環境
main/tag → 本番環境
```

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | システムアーキテクチャ |
| [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | 開発者ガイド |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | APIリファレンス |
| [OPERATIONS.md](docs/OPERATIONS.md) | 運用ガイド |
| [RUNBOOK.md](docs/RUNBOOK.md) | オペレーション手順書 |

## 開発

### テスト実行

```bash
# ユニットテスト
npm test

# カバレッジ付きテスト
npm run test:coverage

# Lint
npm run lint

# 型チェック
npm run typecheck
```

### セキュリティスキャン

```bash
# npm audit
npm audit

# Trivy (要インストール)
npm run security:scan

# Secrets スキャン
npm run security:secrets-scan
```

## Security & Governance

### Secrets Guard

機密情報（APIキー、トークン等）の自動検出と秘匿化を行います。

```typescript
import { redactSecrets, redactObject } from './src/proxy-mcp/security';

// 文字列からシークレットを秘匿化
const safe = redactSecrets('API key: sk-abc123...');
// → 'API key: [REDACTED:OPENAI_KEY]'

// オブジェクト全体を再帰的に秘匿化
const safeData = redactObject({ token: 'ghp_xxx...' });
```

対応プロバイダー: GitHub, AWS, Slack, OpenAI, Stripe, Notion, Google等

### Policy-as-Code

セキュリティポリシーをJSONで定義し、危険な操作を制御します。

```json
// config/proxy-mcp/policy.json
{
  "safetyRules": [
    {
      "category": "deployment",
      "keywords": ["deploy", "production"],
      "action": "require_human",
      "riskLevel": "critical"
    }
  ]
}
```

アクション:
- `allow` - 自動実行
- `require_human` - 人間の承認が必要
- `deny` - 実行をブロック

### Approval Binding

承認が特定のプランに紐付けられ、プラン改ざん攻撃を防止します。

- **Plan Hash**: 実行プランのSHA-256ハッシュ
- **TTL**: 承認の有効期限（デフォルト24時間）
- **Attack Prevention**: プラン置換・ステップ改ざんを検出

詳細は [docs/third-agent/37_SECURITY_POLICY_APPROVAL.md](docs/third-agent/37_SECURITY_POLICY_APPROVAL.md) を参照してください。

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## コントリビューション

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## サポート

- Issues: [GitHub Issues](https://github.com/taiyousan15/taisun_agent/issues)

---

Built with Claude Code
