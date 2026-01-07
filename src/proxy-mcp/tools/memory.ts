/**
 * Memory Tools - Store and retrieve data without cluttering conversation
 *
 * M3 Update: Uses MemoryService with short/long namespace separation
 * and minimal output principle (summary + refId center).
 *
 * Security: Input validation added to prevent DoS and injection attacks.
 */

import { ToolResult } from '../types';
import { getMemoryService, MemoryNamespace, MemoryOutput } from '../memory';

// Security: Input validation constants
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TAG_LENGTH = 50;
const MAX_TAGS = 20;
const MAX_SOURCE_LENGTH = 200;
const MIN_IMPORTANCE = 0;
const MAX_IMPORTANCE = 10;
const MAX_QUERY_LENGTH = 1000;
const MAX_METADATA_SIZE = 10000; // 10KB

// Security: Valid tag pattern (alphanumeric, hyphen, underscore)
const VALID_TAG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Security: Validate memory add input
 */
function validateMemoryAddInput(
  content: string,
  options?: {
    tags?: string[];
    source?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
  }
): { valid: boolean; error?: string } {
  // Content validation
  if (!content) {
    return { valid: false, error: 'Content cannot be empty' };
  }

  if (content.length > MAX_CONTENT_SIZE) {
    return {
      valid: false,
      error: `Content too large: ${content.length} bytes (max: ${MAX_CONTENT_SIZE})`,
    };
  }

  // Tags validation
  if (options?.tags) {
    if (!Array.isArray(options.tags)) {
      return { valid: false, error: 'Tags must be an array' };
    }

    if (options.tags.length > MAX_TAGS) {
      return { valid: false, error: `Too many tags (max: ${MAX_TAGS})` };
    }

    for (const tag of options.tags) {
      if (typeof tag !== 'string') {
        return { valid: false, error: 'Tags must be strings' };
      }

      if (tag.length > MAX_TAG_LENGTH) {
        return {
          valid: false,
          error: `Tag too long: ${tag.substring(0, 20)}... (max: ${MAX_TAG_LENGTH})`,
        };
      }

      if (!VALID_TAG_PATTERN.test(tag)) {
        return {
          valid: false,
          error: `Invalid tag characters: ${tag}. Only alphanumeric, hyphen, underscore allowed.`,
        };
      }
    }
  }

  // Source validation
  if (options?.source) {
    if (typeof options.source !== 'string') {
      return { valid: false, error: 'Source must be a string' };
    }

    if (options.source.length > MAX_SOURCE_LENGTH) {
      return {
        valid: false,
        error: `Source too long (max: ${MAX_SOURCE_LENGTH} characters)`,
      };
    }
  }

  // Importance validation
  if (options?.importance !== undefined) {
    if (typeof options.importance !== 'number' || isNaN(options.importance)) {
      return { valid: false, error: 'Importance must be a number' };
    }

    if (options.importance < MIN_IMPORTANCE || options.importance > MAX_IMPORTANCE) {
      return {
        valid: false,
        error: `Importance out of range (${MIN_IMPORTANCE}-${MAX_IMPORTANCE})`,
      };
    }
  }

  // Metadata size check
  if (options?.metadata) {
    try {
      const metadataSize = JSON.stringify(options.metadata).length;
      if (metadataSize > MAX_METADATA_SIZE) {
        return {
          valid: false,
          error: `Metadata too large: ${metadataSize} bytes (max: ${MAX_METADATA_SIZE})`,
        };
      }
    } catch {
      return { valid: false, error: 'Metadata is not serializable' };
    }
  }

  return { valid: true };
}

/**
 * Security: Sanitize tags (lowercase, remove invalid chars)
 */
function sanitizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return tags.map((tag) =>
    tag
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, MAX_TAG_LENGTH)
  ).filter((tag) => tag.length > 0);
}

/**
 * Add content to memory and return a reference ID
 *
 * Output is minimal: refId + summary + metadata only
 */
export async function memoryAdd(
  content: string,
  namespace: MemoryNamespace = 'short-term',
  options?: {
    tags?: string[];
    source?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<ToolResult> {
  // Security: Validate input to prevent DoS and injection
  const validation = validateMemoryAddInput(content, options);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.error}`,
    };
  }

  try {
    const service = getMemoryService();

    // Security: Sanitize tags before storage
    const sanitizedTags = sanitizeTags(options?.tags);

    const result = await service.add(content, {
      namespace,
      tags: sanitizedTags,
      source: options?.source?.substring(0, MAX_SOURCE_LENGTH),
      importance: options?.importance,
      metadata: options?.metadata,
    });

    // Return minimal output (refId + summary + metadata)
    return {
      success: true,
      referenceId: result.id,
      data: {
        id: result.id,
        namespace,
        contentLength: content.length,
        summary: result.summary,
        message: `Stored ${content.length} chars in ${namespace}. Use memory_search("${result.id}") to retrieve.`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add to memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Search memory by ID or keyword
 *
 * Output is minimal by default: summary + refId + score + tags
 * Use includeContent=true to get content preview (still limited)
 */
export async function memorySearch(
  query: string,
  options?: {
    namespace?: MemoryNamespace;
    tags?: string[];
    limit?: number;
    includeContent?: boolean;
  }
): Promise<ToolResult> {
  // Security: Validate query length
  if (!query || query.trim() === '') {
    return {
      success: false,
      error: 'Query cannot be empty',
    };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return {
      success: false,
      error: `Query too long (max: ${MAX_QUERY_LENGTH} characters)`,
    };
  }

  // Security: Sanitize tags in search options
  const sanitizedOptions = {
    ...options,
    tags: sanitizeTags(options?.tags),
    limit: Math.min(options?.limit || 10, 100), // Cap limit at 100
  };

  try {
    const service = getMemoryService();
    const results = await service.search(query, {
      namespace: sanitizedOptions.namespace,
      tags: sanitizedOptions.tags,
      limit: sanitizedOptions.limit,
      includeContent: sanitizedOptions.includeContent,
    });

    if (results.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          results: [],
          query,
          message: 'No matching entries found.',
        },
      };
    }

    // Format results for minimal output
    const formattedResults = results.map((r: MemoryOutput) => ({
      id: r.id,
      namespace: r.namespace,
      summary: r.summary,
      tags: r.tags,
      score: r.score ? `${(r.score * 100).toFixed(1)}%` : undefined,
      createdAt: new Date(r.createdAt).toISOString(),
      source: r.source,
      importance: r.importance,
      contentPreview: r.contentPreview,
    }));

    return {
      success: true,
      data: {
        found: true,
        results: formattedResults,
        total: results.length,
        query,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to search memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get memory statistics
 */
export async function memoryStats(): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const stats = await service.stats();

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get memory stats: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clear short-term memory (cleanup)
 */
export async function memoryClearShortTerm(): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const cleared = await service.clear('short-term');
    const stats = await service.stats();

    return {
      success: true,
      data: {
        cleared,
        remaining: stats.total,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to clear short-term memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clear all memory (for testing)
 */
export async function memoryClearAll(): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const cleared = await service.clear();

    return {
      success: true,
      data: {
        cleared,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to clear all memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get full content by ID (bypasses preview truncation)
 *
 * Use for large content like URL bundles that need full data.
 */
export async function memoryGetContent(id: string): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const content = await service.getContent(id);

    if (content === null) {
      return {
        success: false,
        error: `Memory entry not found: ${id}`,
      };
    }

    return {
      success: true,
      data: {
        id,
        content,
        contentLength: content.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get memory content: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Delete a specific memory entry by ID
 */
export async function memoryDelete(id: string): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const deleted = await service.delete(id);

    return {
      success: true,
      data: {
        deleted,
        id,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Cleanup expired entries
 */
export async function memoryCleanup(): Promise<ToolResult> {
  try {
    const service = getMemoryService();
    const cleaned = await service.cleanup();

    return {
      success: true,
      data: {
        cleaned,
        message: `Cleaned up ${cleaned} expired entries.`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to cleanup memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
