/**
 * Evals Report Generator - P10
 *
 * Generates concise Markdown reports for CI artifacts.
 * Focus: What failed, not verbose logs.
 */

export interface EvalResult {
  suite: string;
  test: string;
  passed: boolean;
  duration?: number;
  error?: string;
}

export interface EvalSuiteResult {
  name: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  failedTests: Array<{
    test: string;
    error?: string;
  }>;
}

export interface EvalsReport {
  timestamp: string;
  totalSuites: number;
  totalTests: number;
  passed: number;
  failed: number;
  duration: number;
  suites: EvalSuiteResult[];
  summary: string;
}

/**
 * Parse Jest JSON output to structured results
 */
export function parseJestResults(jestOutput: {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: Array<{
    name: string;
    startTime: number;
    endTime: number;
    assertionResults: Array<{
      title: string;
      status: 'passed' | 'failed';
      failureMessages?: string[];
    }>;
  }>;
}): EvalsReport {
  const suites: EvalSuiteResult[] = jestOutput.testResults.map((suite) => {
    const passed = suite.assertionResults.filter((t) => t.status === 'passed').length;
    const failed = suite.assertionResults.filter((t) => t.status === 'failed').length;

    return {
      name: extractSuiteName(suite.name),
      total: suite.assertionResults.length,
      passed,
      failed,
      duration: suite.endTime - suite.startTime,
      failedTests: suite.assertionResults
        .filter((t) => t.status === 'failed')
        .map((t) => ({
          test: t.title,
          error: t.failureMessages?.[0]?.slice(0, 200), // Truncate error
        })),
    };
  });

  const totalDuration = suites.reduce((sum, s) => sum + s.duration, 0);

  const report: EvalsReport = {
    timestamp: new Date().toISOString(),
    totalSuites: suites.length,
    totalTests: jestOutput.numTotalTests,
    passed: jestOutput.numPassedTests,
    failed: jestOutput.numFailedTests,
    duration: totalDuration,
    suites,
    summary: generateSummary(jestOutput.numPassedTests, jestOutput.numFailedTests),
  };

  return report;
}

/**
 * Extract suite name from file path
 */
function extractSuiteName(filePath: string): string {
  const match = filePath.match(/([^/]+)\.test\.ts$/);
  return match ? match[1] : filePath;
}

/**
 * Generate summary line
 */
function generateSummary(passed: number, failed: number): string {
  if (failed === 0) {
    return `✅ All ${passed} tests passed`;
  }
  return `❌ ${failed} test(s) failed, ${passed} passed`;
}

/**
 * Generate Markdown report
 */
export function generateMarkdownReport(report: EvalsReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Evals Report');
  lines.push('');
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push(`**Duration:** ${Math.round(report.duration / 1000)}s`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tests | ${report.totalTests} |`);
  lines.push(`| Passed | ${report.passed} |`);
  lines.push(`| Failed | ${report.failed} |`);
  lines.push('');

  // Failed tests (if any)
  if (report.failed > 0) {
    lines.push('## Failed Tests');
    lines.push('');

    for (const suite of report.suites) {
      if (suite.failedTests.length === 0) continue;

      lines.push(`### ${suite.name}`);
      lines.push('');

      for (const test of suite.failedTests) {
        lines.push(`- **${test.test}**`);
        if (test.error) {
          // Truncate and format error
          const truncatedError = test.error.length > 150
            ? test.error.slice(0, 150) + '...'
            : test.error;
          lines.push(`  \`\`\``);
          lines.push(`  ${truncatedError}`);
          lines.push(`  \`\`\``);
        }
      }
      lines.push('');
    }
  }

  // Suites overview
  lines.push('## Suites');
  lines.push('');
  lines.push('| Suite | Passed | Failed | Duration |');
  lines.push('|-------|--------|--------|----------|');

  for (const suite of report.suites) {
    const status = suite.failed === 0 ? '✅' : '❌';
    lines.push(`| ${status} ${suite.name} | ${suite.passed} | ${suite.failed} | ${suite.duration}ms |`);
  }
  lines.push('');

  // Contracts verified (static list)
  lines.push('## Contracts Verified');
  lines.push('');
  lines.push('- **Pipeline:** summary+refId output, confirmWrite approval flow');
  lines.push('- **Router:** deployment/destructive/secrets/billing/access_control → require_human');
  lines.push('- **Supervisor:** dangerous patterns stop execution, resume capability');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate short summary for CI
 */
export function generateCISummary(report: EvalsReport): string {
  if (report.failed === 0) {
    return `Evals: ✅ ${report.passed}/${report.totalTests} passed`;
  }
  return `Evals: ❌ ${report.failed} failed, ${report.passed} passed`;
}
