/**
 * Router Types - Hybrid Router type definitions
 */

export type RouteAction = 'allow' | 'deny' | 'require_human' | 'require_clarify';

export interface RouteResult {
  action: RouteAction;
  reason: string;
  matchedRule?: string;
  candidates?: McpCandidate[];
  confidence?: number;
}

export interface McpCandidate {
  name: string;
  score: number;
  shortDescription: string;
  tags: string[];
}

export interface RuleMatch {
  pattern: RegExp | string;
  action: RouteAction;
  reason: string;
  priority: number;
}

export interface SafetyRule {
  keywords: string[];
  patterns: RegExp[];
  action: RouteAction;
  category: string;
}

export interface RouterConfig {
  ruleFirst: boolean;
  semanticThreshold: number;
  topK: number;
  fallback: RouteAction;
}

export interface InternalMcpDefinition {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  endpoint?: string;
  enabled: boolean;
  versionPin?: string;
  requiredEnv?: string[];
  tags: string[];
  shortDescription: string;
  dangerousOperations: string[];
  allowlist?: string[];
}

export interface LocalMcpOverride {
  name: string;
  enabled?: boolean;
  versionPin?: string;
  requiredEnv?: string[];
  allowlist?: string[];
}

export interface LocalMcpsConfig {
  mcps: LocalMcpOverride[];
}

export interface InternalMcpsConfig {
  version: string;
  mcps: InternalMcpDefinition[];
  routerConfig: RouterConfig;
}
