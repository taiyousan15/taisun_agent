# TAISUN セットアップガイド（日本語）

## 目次

1. [GitHub Tokenの設定](#github-tokenの設定)
2. [gh CLIのインストール](#gh-cliのインストール)
3. [環境診断の実行](#環境診断の実行)
4. [Issue投稿のトラブルシューティング](#issue投稿のトラブルシューティング)

---

## GitHub Tokenの設定

TAISUN は GitHub Issue に作業ログを自動投稿します。これには GitHub Token が必要です。

### 1. Token の作成

1. https://github.com/settings/tokens にアクセス
2. **"Generate new token (classic)"** をクリック
3. 以下のスコープにチェック:
   - `repo` (リポジトリへのフルアクセス)
4. **"Generate token"** をクリック
5. 表示されたトークンをコピー（`ghp_` で始まる文字列）

### 2. 環境変数の設定

`.env` ファイルを作成（または編集）して、トークンを設定します：

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

⚠️ **注意**: `.env` ファイルは絶対にコミットしないでください！（`.gitignore` に含まれています）

---

## gh CLIのインストール

GitHub CLI (`gh`) は Issue 操作に使用されます。

### macOS

```bash
brew install gh
```

### Ubuntu/Debian

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

### 認証

インストール後、以下を実行して GitHub にログインします：

```bash
gh auth login
```

プロンプトに従って認証を完了してください。

---

## 環境診断の実行

TAISUN には環境診断コマンドが用意されています。Issue 投稿に必要な設定が正しいか確認できます。

### 診断コマンド

```bash
npm run doctor
```

### 出力例（すべて正常）

```
🩺 TAISUN 環境診断
========================================

Locale: ja
診断中...

### GitHub Token
✅ GITHUB_TOKEN: 正常

### gh CLI
✅ gh CLI: 正常

### Repository
✅ Repository (owner/repo): 正常

========================================
✅ すべての診断項目がパスしました。Issue投稿の準備ができています。
```

### 出力例（エラーあり）

```
🩺 TAISUN 環境診断
========================================

Locale: ja
診断中...

### GitHub Token
❌ GITHUB_TOKEN: エラー - Not set

### gh CLI
✅ gh CLI: 正常

### Repository
✅ Repository (owner/repo): 正常

========================================
❌ 1 件のエラーがあります。上記の手順で解決してください。

### GITHUB_TOKEN
GITHUB_TOKEN が設定されていません。

**解決方法:**
1. https://github.com/settings/tokens にアクセス
2. "Generate new token (classic)" をクリック
3. `repo` スコープにチェック
4. トークンを生成して `.env` に設定:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   ```
```

---

## Issue投稿のトラブルシューティング

### 「GITHUB_TOKEN が設定されていません」

1. `.env` ファイルが存在するか確認
2. `GITHUB_TOKEN=ghp_...` が正しく設定されているか確認
3. トークンにプレースホルダー値（`xxxx`）が含まれていないか確認

### 「gh CLI がインストールされていません」

1. `gh --version` でインストールを確認
2. インストールされていなければ、上記の手順でインストール

### 「gh CLI が未ログインです」

```bash
gh auth login
```

を実行して、GitHub にログインしてください。

### 「リポジトリを特定できません」

1. git リポジトリ内で実行しているか確認
2. `git remote -v` でリモートが設定されているか確認
3. 設定されていなければ：

```bash
git remote add origin https://github.com/owner/repo.git
```

### Issue に投稿されない

1. `npm run doctor` でエラーがないか確認
2. `config/proxy-mcp/logging.json` で `issueLogEnabled: true` になっているか確認
3. GitHub Token の権限が `repo` スコープを含んでいるか確認

---

## 設定ファイル

Issue 投稿の挙動は `config/proxy-mcp/logging.json` で設定できます：

```json
{
  "issueLogEnabled": true,
  "issueLogLocale": "ja",
  "autoCreateIssues": true,
  "defaultLabels": ["runlog", "automated"],
  "runlogTitleTemplate": "[RUNLOG] {taskTitle}",
  "requireGitHubAuth": true
}
```

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `issueLogEnabled` | Issue 投稿を有効にする | `true` |
| `issueLogLocale` | ログの言語 (`ja` / `en`) | `ja` |
| `autoCreateIssues` | 自動で Issue を作成 | `true` |
| `defaultLabels` | 作成される Issue のラベル | `["runlog", "automated"]` |
| `requireGitHubAuth` | 認証がない場合に停止 | `true` |

---

## 言語の切り替え

デフォルトは日本語です。英語に切り替えるには：

### 方法1: 環境変数

```bash
export TAISUN_LOCALE=en
```

### 方法2: 設定ファイル

`config/proxy-mcp/logging.json` で `issueLogLocale` を変更：

```json
{
  "issueLogLocale": "en"
}
```
