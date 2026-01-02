/**
 * Skill Tools - Search and run skills from .claude/skills
 *
 * M2 Update: Added routing support for internal MCP selection
 * M4 Update: Added web skills (read_url, extract_links, capture_dom_map)
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillDefinition, ToolResult } from '../types';
import { route, RouteResult } from '../router';
import { getAllMcps, getRouterConfig } from '../internal/registry';
import { readUrl, extractLinks, captureDomMap } from '../browser';

const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');

export type SkillRunMode = 'preview' | 'route' | 'execute';

/**
 * Search for skills matching a query
 */
export function skillSearch(query: string): ToolResult {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return {
        success: true,
        data: {
          skills: [],
          message: 'Skills directory not found',
        },
      };
    }

    const skills: SkillDefinition[] = [];
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, entry.name);
        const skillMdPath = path.join(skillPath, 'SKILL.md');

        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const descMatch = content.match(/^#\s+(.+)/m);
          const description = descMatch ? descMatch[1] : entry.name;

          // Simple query matching
          const queryLower = query.toLowerCase();
          const nameMatch = entry.name.toLowerCase().includes(queryLower);
          const descMatch2 = description.toLowerCase().includes(queryLower);

          if (!query || nameMatch || descMatch2) {
            skills.push({
              name: entry.name,
              description: description.substring(0, 100),
              path: skillPath,
            });
          }
        }
      }
    }

    return {
      success: true,
      data: {
        skills: skills.slice(0, 10), // Limit to 10 results
        total: skills.length,
        query: query || '(all)',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to search skills: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run a skill by name
 *
 * @param skillName - Name of the skill to run (or web.read_url, web.extract_links, web.capture_dom_map)
 * @param params - Optional parameters
 * @param params.mode - 'preview' (default), 'route', or 'execute'
 * @param params.input - Input for routing (used when mode='route')
 * @param params.url - URL for web skills
 * @param params.namespace - Memory namespace for web skills
 */
export function skillRun(
  skillName: string,
  params?: Record<string, unknown>
): ToolResult {
  const mode = (params?.mode as SkillRunMode) || 'preview';

  try {
    // Mode: route - Use hybrid router to find best MCP
    if (mode === 'route') {
      return skillRoute(params?.input as string);
    }

    // M4: Handle web skills (async, return promise wrapper)
    if (skillName.startsWith('web.')) {
      return runWebSkill(skillName, params);
    }

    // Mode: preview or execute - Load skill content from files
    const skillPath = path.join(SKILLS_DIR, skillName);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return {
        success: false,
        error: `Skill not found: ${skillName}`,
      };
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');

    // Mode: execute - Will be implemented in M3+
    if (mode === 'execute') {
      return {
        success: true,
        data: {
          skill: skillName,
          status: 'pending_execution',
          contentPreview: content.substring(0, 300),
          message: 'Execution mode requires M3+ integration. Use mode=route to see MCP candidates.',
        },
      };
    }

    // Mode: preview (default) - Return skill content
    return {
      success: true,
      data: {
        skill: skillName,
        status: 'loaded',
        contentPreview: content.substring(0, 500),
        message: 'Skill loaded. Use mode=route to see which internal MCP would handle this.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to run skill: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run a web skill (M4)
 *
 * Web skills are async but we return a sync wrapper that
 * indicates the skill needs to be awaited.
 */
function runWebSkill(skillName: string, params?: Record<string, unknown>): ToolResult {
  const url = params?.url as string;

  if (!url) {
    return {
      success: false,
      error: `URL is required for ${skillName}. Use params.url to specify the target URL.`,
    };
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return {
      success: false,
      error: `Invalid URL: ${url}`,
    };
  }

  // Return info about how to execute (sync wrapper for async skill)
  // The actual execution happens via skillRunAsync
  return {
    success: true,
    data: {
      skill: skillName,
      url,
      status: 'ready',
      message: `Web skill ${skillName} is ready. Use skillRunAsync() for actual execution.`,
      asyncRequired: true,
    },
  };
}

/**
 * Run a web skill asynchronously (M4)
 *
 * This is the actual async execution of web skills.
 * Returns summary + refId following minimal output principle.
 */
export async function skillRunAsync(
  skillName: string,
  params?: Record<string, unknown>
): Promise<ToolResult> {
  const url = params?.url as string;

  if (!url) {
    return {
      success: false,
      error: `URL is required for ${skillName}`,
    };
  }

  try {
    switch (skillName) {
      case 'web.read_url': {
        const result = await readUrl(url, {
          namespace: (params?.namespace as 'short-term' | 'long-term') || 'short-term',
          maxLength: (params?.maxLength as number) || 50000,
        });
        return {
          success: result.success,
          referenceId: result.refId,
          data: {
            action: result.action,
            summary: result.summary,
            ...result.data,
          },
          error: result.error,
        };
      }

      case 'web.extract_links': {
        const result = await extractLinks(url, {
          namespace: (params?.namespace as 'short-term' | 'long-term') || 'short-term',
          filter: (params?.filter as 'internal' | 'external' | 'all') || 'all',
        });
        return {
          success: result.success,
          referenceId: result.refId,
          data: {
            action: result.action,
            summary: result.summary,
            ...result.data,
          },
          error: result.error,
        };
      }

      case 'web.capture_dom_map': {
        const result = await captureDomMap(url, {
          namespace: (params?.namespace as 'short-term' | 'long-term') || 'short-term',
        });
        return {
          success: result.success,
          referenceId: result.refId,
          data: {
            action: result.action,
            summary: result.summary,
            ...result.data,
          },
          error: result.error,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown web skill: ${skillName}. Available: web.read_url, web.extract_links, web.capture_dom_map`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: `Web skill ${skillName} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Route an input to find the best internal MCP
 */
export function skillRoute(input: string | undefined): ToolResult {
  if (!input) {
    return {
      success: false,
      error: 'Input is required for routing. Use params.input to specify the task.',
    };
  }

  try {
    const mcps = getAllMcps();
    const config = getRouterConfig();
    const result: RouteResult = route(input, mcps, config);

    return {
      success: true,
      data: {
        action: result.action,
        reason: result.reason,
        matchedRule: result.matchedRule,
        confidence: result.confidence,
        candidates: result.candidates?.map((c) => ({
          name: c.name,
          score: `${(c.score * 100).toFixed(1)}%`,
          description: c.shortDescription,
          tags: c.tags,
        })),
        message: getActionMessage(result),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Routing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get human-readable message for route action
 */
function getActionMessage(result: RouteResult): string {
  switch (result.action) {
    case 'allow':
      return `Ready to proceed with ${result.candidates?.[0]?.name || 'matched MCP'}.`;
    case 'require_human':
      return 'This operation requires human confirmation before proceeding.';
    case 'require_clarify':
      return 'Please clarify your intent or provide more details.';
    case 'deny':
      return 'This operation is not permitted.';
    default:
      return 'Unknown action.';
  }
}
