/**
 * Trigger Evaluation - Conditional MCP loading based on input context
 *
 * MCPs with triggers.deferredOnly=true are only loaded when:
 * - Input contains matching file extensions
 * - Input contains matching MIME types
 * - Input contains matching URL suffixes
 * - Input contains matching keywords
 */

import { InternalMcpDefinition } from '../router/types';

export interface TriggerContext {
  /** Raw input text */
  input?: string;
  /** File paths mentioned in input */
  filePaths?: string[];
  /** URLs mentioned in input */
  urls?: string[];
  /** MIME types of attached files */
  mimeTypes?: string[];
  /** File extensions of attached files */
  fileExts?: string[];
}

/**
 * Check if a file path or URL ends with any of the given suffixes
 */
function matchesSuffix(path: string, suffixes: string[]): boolean {
  const lowerPath = path.toLowerCase();
  return suffixes.some((suffix) => lowerPath.endsWith(suffix.toLowerCase()));
}

/**
 * Extract file extension from a path
 */
function getExtension(path: string): string | null {
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract file paths from text (local paths and URLs)
 */
export function extractPaths(text: string): { filePaths: string[]; urls: string[] } {
  const filePaths: string[] = [];
  const urls: string[] = [];

  // Match URLs (http/https)
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const urlMatches = text.match(urlRegex) || [];
  urls.push(...urlMatches);

  // Match local file paths (Unix and Windows style)
  // Unix: /path/to/file.pdf or ~/path/to/file.pdf
  // Windows: C:\path\to\file.pdf or \\server\share\file.pdf
  const pathRegex =
    /(?:\/[\w.-]+)+\.[\w]+|~\/[\w./-]+\.[\w]+|[A-Za-z]:\\[\w\\.-]+\.[\w]+|\\\\[\w\\.-]+\.[\w]+/g;
  const pathMatches = text.match(pathRegex) || [];
  filePaths.push(...pathMatches);

  return { filePaths, urls };
}

/**
 * Check if a single MCP's triggers match the context
 */
export function evaluateTriggers(mcp: InternalMcpDefinition, context: TriggerContext): boolean {
  const triggers = mcp.triggers;

  // No triggers defined = always matches (not deferred)
  if (!triggers) {
    return true;
  }

  // If not deferredOnly, always include
  if (!triggers.deferredOnly) {
    return true;
  }

  // Check file extensions
  if (triggers.fileExts && triggers.fileExts.length > 0) {
    const targetExts = triggers.fileExts.map((e) => e.toLowerCase());

    // Check explicit file extensions from context
    if (context.fileExts?.some((ext) => targetExts.includes(ext.toLowerCase()))) {
      return true;
    }

    // Check extensions from file paths
    if (context.filePaths?.some((path) => {
      const ext = getExtension(path);
      return ext && targetExts.includes(ext);
    })) {
      return true;
    }

    // Check extensions from URLs
    if (context.urls?.some((url) => {
      // Remove query string and fragment before checking extension
      const cleanUrl = url.split('?')[0].split('#')[0];
      const ext = getExtension(cleanUrl);
      return ext && targetExts.includes(ext);
    })) {
      return true;
    }
  }

  // Check MIME types
  if (triggers.mimeTypes && triggers.mimeTypes.length > 0) {
    if (context.mimeTypes?.some((mime) =>
      triggers.mimeTypes!.some((t) => mime.toLowerCase().includes(t.toLowerCase()))
    )) {
      return true;
    }
  }

  // Check URL suffixes
  if (triggers.urlSuffixes && triggers.urlSuffixes.length > 0) {
    if (context.urls?.some((url) => matchesSuffix(url.split('?')[0], triggers.urlSuffixes!))) {
      return true;
    }
    if (context.filePaths?.some((path) => matchesSuffix(path, triggers.urlSuffixes!))) {
      return true;
    }
  }

  // Check keywords in input
  if (triggers.keywords && triggers.keywords.length > 0 && context.input) {
    const lowerInput = context.input.toLowerCase();
    if (triggers.keywords.some((kw) => lowerInput.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  // No triggers matched
  return false;
}

/**
 * Filter MCPs based on trigger conditions
 * Returns only MCPs that should be active for the given context
 */
export function filterMcpsByTriggers(
  mcps: InternalMcpDefinition[],
  context: TriggerContext
): InternalMcpDefinition[] {
  return mcps.filter((mcp) => {
    // Disabled MCPs are always excluded
    if (!mcp.enabled) {
      return false;
    }

    // Evaluate triggers
    return evaluateTriggers(mcp, context);
  });
}

/**
 * Build trigger context from raw input
 */
export function buildTriggerContext(input: string): TriggerContext {
  const { filePaths, urls } = extractPaths(input);

  return {
    input,
    filePaths,
    urls,
    mimeTypes: [], // MIME types would come from file attachments
    fileExts: [], // File extensions would come from file attachments
  };
}

/**
 * Check if input contains PDF references
 * Convenience function for PDF-specific checks
 */
export function hasPdfReference(input: string): boolean {
  const context = buildTriggerContext(input);

  // Check for .pdf files in paths or URLs
  const allPaths = [...(context.filePaths || []), ...(context.urls || [])];
  return allPaths.some((path) => {
    const cleanPath = path.split('?')[0].split('#')[0].toLowerCase();
    return cleanPath.endsWith('.pdf');
  });
}
