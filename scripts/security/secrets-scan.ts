#!/usr/bin/env npx ts-node
/**
 * Secrets Scan CLI - P11
 *
 * Lightweight repository secrets scanner for CI.
 * No network dependency - runs locally with pattern matching.
 *
 * Features:
 * - Conservative patterns to minimize false positives
 * - Allowlist support for known safe files
 * - Safe output (never prints the actual secrets)
 *
 * Usage:
 *   npx ts-node scripts/security/secrets-scan.ts [options]
 *
 * Options:
 *   --path <dir>       Directory to scan (default: current directory)
 *   --allowlist <file> Allowlist file path (default: config/security/secrets-scan.allowlist.txt)
 *   --verbose          Show all scanned files
 *   --help             Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import { SECRET_PATTERNS, isAllowlisted } from '../../src/proxy-mcp/security/patterns';

const HELP_TEXT = `
Secrets Scan CLI - P11
======================

Scans repository for accidentally committed secrets.

Usage:
  npx ts-node scripts/security/secrets-scan.ts [options]

Options:
  --path <dir>       Directory to scan (default: current directory)
  --allowlist <file> Allowlist file path
  --verbose          Show all scanned files
  --help             Show this help message

Examples:
  # Scan current directory
  npx ts-node scripts/security/secrets-scan.ts

  # Scan specific directory
  npx ts-node scripts/security/secrets-scan.ts --path ./src

  # Use custom allowlist
  npx ts-node scripts/security/secrets-scan.ts --allowlist ./my-allowlist.txt
`;

interface ScanResult {
  file: string;
  line: number;
  patternName: string;
  // Note: We never include the actual secret content
}

interface ScanSummary {
  filesScanned: number;
  filesWithSecrets: number;
  totalFindings: number;
  findings: ScanResult[];
}

interface CliArgs {
  path: string;
  allowlistPath: string;
  verbose: boolean;
  help: boolean;
}

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml',
  '.env', '.sh', '.bash', '.zsh', '.py', '.rb', '.go',
  '.java', '.kt', '.scala', '.cs', '.php', '.rs', '.swift',
];

const DEFAULT_IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '__pycache__', 'venv', '.venv',
];

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    path: process.cwd(),
    allowlistPath: path.join(process.cwd(), 'config', 'security', 'secrets-scan.allowlist.txt'),
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--path' && i + 1 < args.length) {
      result.path = args[++i];
    } else if (arg === '--allowlist' && i + 1 < args.length) {
      result.allowlistPath = args[++i];
    }
  }

  return result;
}

function loadAllowlist(allowlistPath: string): string[] {
  if (!fs.existsSync(allowlistPath)) {
    return [];
  }

  const content = fs.readFileSync(allowlistPath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function matchesGlobPattern(filePath: string, pattern: string): boolean {
  // Simple glob matching (supports * and **)
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

function isFileAllowed(filePath: string, allowlistPatterns: string[]): boolean {
  const relativePath = path.relative(process.cwd(), filePath);
  return allowlistPatterns.some(pattern => matchesGlobPattern(relativePath, pattern));
}

function scanFile(filePath: string): ScanResult[] {
  const results: ScanResult[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip if content is allowlisted (example/dummy values)
      if (isAllowlisted(line)) {
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test(line)) {
          results.push({
            file: filePath,
            line: lineNum + 1,
            patternName: pattern.name,
          });
          // Only report first pattern match per line to avoid duplicates
          break;
        }
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return results;
}

function getFilesToScan(dirPath: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORE_DIRS.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (DEFAULT_EXTENSIONS.includes(ext) || entry.name.startsWith('.env')) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dirPath);
  return files;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const allowlistPatterns = loadAllowlist(args.allowlistPath);

  if (args.verbose) {
    console.log(`Scanning: ${args.path}`);
    console.log(`Allowlist patterns: ${allowlistPatterns.length}`);
    console.log('');
  }

  const files = getFilesToScan(args.path);
  const summary: ScanSummary = {
    filesScanned: 0,
    filesWithSecrets: 0,
    totalFindings: 0,
    findings: [],
  };

  const filesWithFindings = new Set<string>();

  for (const file of files) {
    if (isFileAllowed(file, allowlistPatterns)) {
      if (args.verbose) {
        console.log(`[SKIP] ${path.relative(process.cwd(), file)}`);
      }
      continue;
    }

    summary.filesScanned++;

    if (args.verbose) {
      console.log(`[SCAN] ${path.relative(process.cwd(), file)}`);
    }

    const results = scanFile(file);
    if (results.length > 0) {
      filesWithFindings.add(file);
      summary.findings.push(...results);
      summary.totalFindings += results.length;
    }
  }

  summary.filesWithSecrets = filesWithFindings.size;

  // Output results
  console.log('');
  console.log('='.repeat(60));
  console.log('Secrets Scan Results');
  console.log('='.repeat(60));
  console.log(`Files scanned: ${summary.filesScanned}`);
  console.log(`Files with potential secrets: ${summary.filesWithSecrets}`);
  console.log(`Total findings: ${summary.totalFindings}`);
  console.log('');

  if (summary.totalFindings > 0) {
    console.log('Findings:');
    console.log('-'.repeat(60));

    // Group by file
    const byFile = new Map<string, ScanResult[]>();
    for (const finding of summary.findings) {
      const relativePath = path.relative(process.cwd(), finding.file);
      if (!byFile.has(relativePath)) {
        byFile.set(relativePath, []);
      }
      byFile.get(relativePath)!.push(finding);
    }

    for (const [file, findings] of byFile) {
      console.log(`\n${file}:`);
      for (const finding of findings) {
        // Never output the actual secret - only line number and pattern name
        console.log(`  Line ${finding.line}: [${finding.patternName}]`);
      }
    }

    console.log('');
    console.log('-'.repeat(60));
    console.log('ACTION REQUIRED: Review and remove secrets before committing.');
    console.log('If these are false positives, add the files to the allowlist.');
    console.log('');

    process.exit(1);
  } else {
    console.log('No secrets detected.');
    console.log('');
    process.exit(0);
  }
}

main();
