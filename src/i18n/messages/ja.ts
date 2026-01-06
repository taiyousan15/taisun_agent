/**
 * Japanese message catalog for issue logging
 */

export const ja = {
  // Issue logging
  'issue.runlog.title': '[RUNLOG] {taskTitle}',
  'issue.runlog.created': '## Supervisor 実行開始\n\n**Run ID:** {runId}\n\n**入力:** {input}\n\n**開始時刻:** {startedAt}\n\n---\n\nこのIssueで実行の進捗を追跡します。',
  'issue.progress.plan': '## 計画作成完了\n\n**リスクレベル:** {risk}\n\n**ステップ数:** {stepCount}\n\n{steps}',
  'issue.progress.approval': '## 承認待機中\n\n承認が必要です。Issue #{approvalIssue} で承認してください。',
  'issue.progress.execute': '## 実行完了\n\n**サマリー:** {summary}\n\n**参照ID:** {refId}',
  'issue.finish.success': '## 実行成功\n\n**完了時刻:** {completedAt}\n\n**結果:** 成功',
  'issue.finish.error': '## 実行失敗\n\n**完了時刻:** {completedAt}\n\n**エラー:** {error}',
  'issue.require_human.stop': '## 手動対応が必要です\n\n**理由:** {reason}\n\n以下の手順で解決してください:\n\n{instructions}',

  // Environment check
  'env.check.title': '環境チェック結果',
  'env.check.success': '✅ すべての環境設定が正常です',
  'env.check.failed': '❌ 環境設定に問題があります',
  'env.missing.github_token': 'GITHUB_TOKEN が設定されていません。\n\n**解決方法:**\n1. https://github.com/settings/tokens にアクセス\n2. "Generate new token (classic)" をクリック\n3. `repo` スコープにチェック\n4. トークンを生成して `.env` に設定:\n   ```\n   GITHUB_TOKEN=ghp_xxxxxxxxxxxx\n   ```',
  'env.missing.gh_cli': 'gh CLI がインストールされていないか、未ログインです。\n\n**解決方法:**\n1. インストール: `brew install gh`\n2. ログイン: `gh auth login`',
  'env.missing.repo': 'リポジトリを特定できません。\n\n**解決方法:**\n1. git リポジトリ内で実行してください\n2. または `git remote add origin <url>` でリモートを設定',
  'env.token.invalid': 'GITHUB_TOKEN の権限が不足しています。`repo` スコープが必要です。',

  // Doctor
  'doctor.title': '🩺 TAISUN 環境診断',
  'doctor.checking': '診断中...',
  'doctor.result.ok': '✅ {item}: 正常',
  'doctor.result.warn': '⚠️ {item}: 警告 - {message}',
  'doctor.result.error': '❌ {item}: エラー - {message}',
  'doctor.summary.all_ok': '\n✅ すべての診断項目がパスしました。Issue投稿の準備ができています。',
  'doctor.summary.has_errors': '\n❌ {count} 件のエラーがあります。上記の手順で解決してください。',
};
