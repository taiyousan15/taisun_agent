/**
 * Memory Tools - Store and retrieve data without cluttering conversation
 *
 * M3 Update: Uses MemoryService with short/long namespace separation
 * and minimal output principle (summary + refId center).
 */

import { ToolResult } from '../types';
import { getMemoryService, MemoryNamespace, MemoryOutput } from '../memory';

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
  try {
    const service = getMemoryService();
    const result = await service.add(content, {
      namespace,
      tags: options?.tags,
      source: options?.source,
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
  try {
    const service = getMemoryService();
    const results = await service.search(query, {
      namespace: options?.namespace,
      tags: options?.tags,
      limit: options?.limit,
      includeContent: options?.includeContent,
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
