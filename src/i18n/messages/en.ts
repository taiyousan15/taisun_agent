/**
 * English message catalog for issue logging
 */

export const en = {
  // Issue logging
  'issue.runlog.title': '[RUNLOG] {taskTitle}',
  'issue.runlog.created': '## Supervisor Run Started\n\n**Run ID:** {runId}\n\n**Input:** {input}\n\n**Started:** {startedAt}\n\n---\n\nThis issue tracks the supervisor run. Updates will be posted as comments.',
  'issue.progress.plan': '## Plan Created\n\n**Risk Level:** {risk}\n\n**Steps:** {stepCount}\n\n{steps}',
  'issue.progress.approval': '## Waiting for Approval\n\nApproval required. Please approve on Issue #{approvalIssue}.',
  'issue.progress.execute': '## Execution Complete\n\n**Summary:** {summary}\n\n**Reference ID:** {refId}',
  'issue.finish.success': '## Run Completed Successfully\n\n**Completed:** {completedAt}\n\n**Result:** Success',
  'issue.finish.error': '## Run Failed\n\n**Completed:** {completedAt}\n\n**Error:** {error}',
  'issue.require_human.stop': '## Manual Action Required\n\n**Reason:** {reason}\n\nPlease follow these steps:\n\n{instructions}',

  // Environment check
  'env.check.title': 'Environment Check Results',
  'env.check.success': '✅ All environment settings are correct',
  'env.check.failed': '❌ Environment settings have issues',
  'env.missing.github_token': 'GITHUB_TOKEN is not set.\n\n**How to fix:**\n1. Go to https://github.com/settings/tokens\n2. Click "Generate new token (classic)"\n3. Check the `repo` scope\n4. Generate and add to `.env`:\n   ```\n   GITHUB_TOKEN=ghp_xxxxxxxxxxxx\n   ```',
  'env.missing.gh_cli': 'gh CLI is not installed or not logged in.\n\n**How to fix:**\n1. Install: `brew install gh`\n2. Login: `gh auth login`',
  'env.missing.repo': 'Could not determine repository.\n\n**How to fix:**\n1. Run inside a git repository\n2. Or set remote: `git remote add origin <url>`',
  'env.token.invalid': 'GITHUB_TOKEN has insufficient permissions. `repo` scope is required.',

  // Doctor
  'doctor.title': '🩺 TAISUN Environment Diagnostics',
  'doctor.checking': 'Checking...',
  'doctor.result.ok': '✅ {item}: OK',
  'doctor.result.warn': '⚠️ {item}: Warning - {message}',
  'doctor.result.error': '❌ {item}: Error - {message}',
  'doctor.summary.all_ok': '\n✅ All checks passed. Ready for issue logging.',
  'doctor.summary.has_errors': '\n❌ {count} error(s) found. Please fix the issues above.',
};
