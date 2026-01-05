# TAISUN v2 クイックスタート

**5分で動かす最短手順**

```
git clone → npm install → npm test → 完了
```

---

## Step 1: クローン (30秒)

```bash
git clone https://github.com/taiyousan15/taisun_agent.git
cd taisun_agent
```

## Step 2: インストール (2分)

```bash
npm install
```

> `postinstall` で自動ビルドが実行されます。完了まで待ってください。

## Step 3: 動作確認 (2分)

```bash
# テスト実行 (524テスト)
npm test

# 環境診断
npm run doctor
```

**期待される出力:**

```
✅ Node.js version: 18.x.x (required: >=18.0.0)
✅ npm version: 9.x.x
✅ TypeScript compiled successfully
✅ All 524 tests passed
```

---

## これで基本セットアップ完了

以下は必要に応じて設定してください。

---

## オプション: 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集:

```bash
# 必須ではないが、推奨
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx  # GitHub連携に必要
TAISUN_LOCALE=ja                 # 日本語出力
```

## オプション: Dockerツール起動

```bash
# ドキュメント処理ツール (Gotenberg, Stirling-PDF)
make tools-up

# モニタリングスタック (Prometheus, Grafana, Loki)
make monitoring-up
```

## オプション: スケジューラー起動

```bash
# 日次/週次レポートの自動実行
npm run ops:schedule:loop &
```

---

## 次のステップ

| やりたいこと | コマンド/ドキュメント |
|-------------|---------------------|
| 利用可能なエージェント一覧 | `npm run agents:list` |
| 利用可能なスキル一覧 | `npm run skills:list` |
| システム全体を理解 | [README.md](../README.md) |
| 設定ファイルの詳細 | [CONFIG.md](./CONFIG.md) |
| エラーが出た場合 | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) |
| 開発に参加したい | [CONTRIBUTING.md](./CONTRIBUTING.md) |

---

## よくある質問

### Q: `npm install` が失敗する

```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: テストがスキップされる

一部のテストはオプション機能（Chrome、Docker等）が必要です。スキップは正常動作です。

### Q: `dist/` が見つからない

```bash
npm run build:all
```

---

## 最小動作要件

| 要件 | バージョン |
|------|-----------|
| Node.js | 18.0.0+ |
| npm | 9.0.0+ |
| Git | 2.0.0+ |

オプション:
- Docker (モニタリング/ドキュメント処理)
- GitHub CLI (`gh`) (Issue/PR操作)

---

*問題が解決しない場合は [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) を参照してください。*
