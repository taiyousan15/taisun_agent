#!/usr/bin/env npx ts-node
/**
 * Evals Report CLI - P10
 *
 * Generates Markdown reports from Jest JSON output for CI artifacts.
 *
 * Usage:
 *   npx ts-node scripts/evals/generate-report.ts [options]
 *
 * Options:
 *   --input <file>    - Jest JSON output file (default: jest-results.json)
 *   --output <file>   - Output Markdown file (default: evals-report.md)
 *   --summary         - Print short CI summary only
 *   --help            - Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseJestResults,
  generateMarkdownReport,
  generateCISummary,
} from '../../src/proxy-mcp/evals/report';

const HELP_TEXT = `
Evals Report CLI - P10
======================

Generates Markdown reports from Jest JSON output.

Usage:
  npx ts-node scripts/evals/generate-report.ts [options]

Options:
  --input <file>    Jest JSON output file (default: jest-results.json)
  --output <file>   Output Markdown file (default: evals-report.md)
  --summary         Print short CI summary only
  --help            Show this help message

Examples:
  # Generate full report
  npm run test:evals -- --json --outputFile=jest-results.json
  npx ts-node scripts/evals/generate-report.ts

  # Generate with custom paths
  npx ts-node scripts/evals/generate-report.ts --input results.json --output report.md

  # CI summary only
  npx ts-node scripts/evals/generate-report.ts --summary
`;

interface CliArgs {
  input: string;
  output: string;
  summaryOnly: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    input: 'jest-results.json',
    output: 'evals-report.md',
    summaryOnly: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--summary') {
      result.summaryOnly = true;
    } else if (arg === '--input' && i + 1 < args.length) {
      result.input = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      result.output = args[++i];
    }
  }

  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Resolve input path
  const inputPath = path.isAbsolute(args.input)
    ? args.input
    : path.join(process.cwd(), args.input);

  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error('\nRun Jest with JSON output first:');
    console.error('  npm run test:evals -- --json --outputFile=jest-results.json');
    process.exit(1);
  }

  // Read and parse Jest JSON output
  let jestOutput: ReturnType<typeof JSON.parse>;
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    jestOutput = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Failed to parse input file: ${inputPath}`);
    console.error((error as Error).message);
    process.exit(1);
  }

  // Parse to structured report
  const report = parseJestResults(jestOutput);

  if (args.summaryOnly) {
    // Print CI summary only
    console.log(generateCISummary(report));
    process.exit(report.failed > 0 ? 1 : 0);
  }

  // Generate Markdown report
  const markdown = generateMarkdownReport(report);

  // Resolve output path
  const outputPath = path.isAbsolute(args.output)
    ? args.output
    : path.join(process.cwd(), args.output);

  // Write output
  fs.writeFileSync(outputPath, markdown, 'utf-8');

  console.log(`Report generated: ${outputPath}`);
  console.log(generateCISummary(report));

  // Exit with error code if tests failed
  process.exit(report.failed > 0 ? 1 : 0);
}

main();
