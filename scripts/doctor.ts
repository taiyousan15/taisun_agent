#!/usr/bin/env ts-node
/**
 * TAISUN Doctor - Environment Diagnostics
 *
 * Checks if all requirements for GitHub Issue logging are met.
 *
 * Usage:
 *   npm run doctor
 *   npx ts-node scripts/doctor.ts
 */

import { checkGitHubEnv, formatCheckResult, getRepoFromGit } from '../src/utils/env-check';
import { getLocale, t } from '../src/i18n';

async function main() {
  console.log(t('doctor.title'));
  console.log('='.repeat(40));
  console.log('');

  console.log(`Locale: ${getLocale()}`);
  console.log(t('doctor.checking'));
  console.log('');

  // Run environment checks
  const result = checkGitHubEnv();

  // Display individual check results
  console.log('### GitHub Token');
  if (process.env.GITHUB_TOKEN && !process.env.GITHUB_TOKEN.includes('xxxx')) {
    console.log(t('doctor.result.ok', { item: 'GITHUB_TOKEN' }));
  } else {
    console.log(t('doctor.result.error', { item: 'GITHUB_TOKEN', message: 'Not set' }));
  }
  console.log('');

  console.log('### gh CLI');
  const ghError = result.errors.find((e) => e.key === 'gh CLI');
  const ghWarning = result.warnings.find((e) => e.key === 'gh CLI');
  if (!ghError && !ghWarning) {
    console.log(t('doctor.result.ok', { item: 'gh CLI' }));
  } else if (ghWarning) {
    console.log(t('doctor.result.warn', { item: 'gh CLI', message: ghWarning.message }));
  } else if (ghError) {
    console.log(t('doctor.result.error', { item: 'gh CLI', message: 'Not installed' }));
  }
  console.log('');

  console.log('### Repository');
  const repo = getRepoFromGit();
  if (repo) {
    console.log(t('doctor.result.ok', { item: `Repository (${repo})` }));
  } else {
    console.log(t('doctor.result.error', { item: 'Repository', message: 'Not detected' }));
  }
  console.log('');

  // Summary
  console.log('='.repeat(40));
  if (result.valid) {
    console.log(t('doctor.summary.all_ok'));
    process.exit(0);
  } else {
    console.log(t('doctor.summary.has_errors', { count: result.errors.length }));
    console.log('');

    // Print detailed instructions for each error
    for (const error of result.errors) {
      console.log(`### ${error.key}`);
      console.log(error.message);
      console.log('');
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Doctor failed:', err.message);
  process.exit(1);
});
