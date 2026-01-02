/**
 * Web Skills - Browser automation skills for M4
 *
 * Skills:
 * - web.read_url: Read URL and summarize (full content to refId)
 * - web.extract_links: Extract page links (large lists to refId)
 * - web.capture_dom_map: Capture DOM structure (map to refId)
 *
 * All output follows minimal output principle: summary + refId
 */

import { WebSkillResult, PageLink, DomMap } from './types';
import { guardCaptcha, checkBlockedPatterns } from './captcha';
import { getClient } from '../internal/mcp-client';
import { memoryAdd } from '../tools/memory';
import { MemoryNamespace } from '../memory/types';

/**
 * web.read_url - Read URL and summarize
 *
 * Opens URL, extracts text content, checks for CAPTCHA,
 * stores full content in memory, returns summary + refId
 */
export async function readUrl(
  url: string,
  options?: {
    namespace?: MemoryNamespace;
    maxLength?: number;
  }
): Promise<WebSkillResult> {
  // Check for blocked patterns (login, auth, etc.)
  const blocked = checkBlockedPatterns(url);
  if (blocked) return blocked;

  const namespace = options?.namespace || 'short-term';
  const maxLength = options?.maxLength || 50000;

  try {
    // Try to use chrome MCP
    const client = getClient('chrome');
    if (!client || !client.isAvailable()) {
      return {
        success: false,
        error: 'Chrome MCP not available. Ensure it is enabled and mcp-server-puppeteer is installed.',
        data: {
          help: [
            '1. Check config/proxy-mcp/internal-mcps.json - chrome.enabled should be true',
            '2. Install puppeteer MCP: npx -y @anthropic/mcp-server-puppeteer',
            '3. Ensure Chrome/Chromium is available on the system',
          ],
        },
      };
    }

    // Start client if needed
    await client.start();

    // Navigate to URL and get content
    let pageContent: string;
    let pageTitle: string;

    try {
      // Navigate
      await client.callTool('puppeteer_navigate', { url });

      // Get page content
      const evalResult = (await client.callTool('puppeteer_evaluate', {
        script: `
          JSON.stringify({
            title: document.title,
            text: document.body.innerText.substring(0, ${maxLength}),
            html: document.documentElement.outerHTML.substring(0, ${maxLength})
          })
        `,
      })) as { result?: string };

      const parsed = JSON.parse(evalResult.result || '{}');
      pageTitle = parsed.title || 'Untitled';
      pageContent = parsed.text || '';
    } catch (err) {
      // Fallback: try simple fetch if MCP call fails
      return {
        success: false,
        error: `Failed to load page: ${err instanceof Error ? err.message : String(err)}`,
        data: {
          url,
          suggestion: 'Try accessing the URL directly or check if the site is accessible.',
        },
      };
    }

    // Check for CAPTCHA
    const captchaCheck = guardCaptcha(pageContent, url);
    if (captchaCheck) return captchaCheck;

    // Store full content in memory
    const memResult = await memoryAdd(
      JSON.stringify({
        url,
        title: pageTitle,
        content: pageContent,
        fetchedAt: new Date().toISOString(),
      }),
      namespace,
      {
        tags: ['web', 'page-content', new URL(url).hostname],
        source: 'web.read_url',
      }
    );

    if (!memResult.success) {
      return {
        success: false,
        error: `Failed to store content: ${memResult.error}`,
      };
    }

    // Generate summary
    const summary = generateSummary(pageTitle, pageContent, url);

    return {
      success: true,
      action: 'allow',
      refId: memResult.referenceId,
      summary,
      data: {
        url,
        title: pageTitle,
        contentLength: pageContent.length,
        message: `Page loaded. Use memory_search("${memResult.referenceId}") for full content.`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `web.read_url failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * web.extract_links - Extract page links
 *
 * Extracts all links from page, stores full list in memory,
 * returns summary with link count + refId
 */
export async function extractLinks(
  url: string,
  options?: {
    namespace?: MemoryNamespace;
    filter?: 'internal' | 'external' | 'all';
  }
): Promise<WebSkillResult> {
  const blocked = checkBlockedPatterns(url);
  if (blocked) return blocked;

  const namespace = options?.namespace || 'short-term';
  const filter = options?.filter || 'all';

  try {
    const client = getClient('chrome');
    if (!client || !client.isAvailable()) {
      return {
        success: false,
        error: 'Chrome MCP not available.',
        data: {
          help: ['Enable chrome in config/proxy-mcp/internal-mcps.json'],
        },
      };
    }

    await client.start();

    // Navigate and extract links
    let links: PageLink[];

    try {
      await client.callTool('puppeteer_navigate', { url });

      const evalResult = (await client.callTool('puppeteer_evaluate', {
        script: `
          JSON.stringify(
            Array.from(document.querySelectorAll('a[href]')).map(a => ({
              href: a.href,
              text: a.innerText.trim().substring(0, 200),
              title: a.title || undefined
            })).filter(l => l.href && l.href.startsWith('http'))
          )
        `,
      })) as { result?: string };

      links = JSON.parse(evalResult.result || '[]');
    } catch (err) {
      return {
        success: false,
        error: `Failed to extract links: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check for CAPTCHA in link texts
    const allText = links.map((l) => l.text).join(' ');
    const captchaCheck = guardCaptcha(allText, url);
    if (captchaCheck) return captchaCheck;

    // Filter links
    const baseHost = new URL(url).hostname;
    let filteredLinks = links;
    if (filter === 'internal') {
      filteredLinks = links.filter((l) => {
        try {
          return new URL(l.href).hostname === baseHost;
        } catch {
          return false;
        }
      });
    } else if (filter === 'external') {
      filteredLinks = links.filter((l) => {
        try {
          return new URL(l.href).hostname !== baseHost;
        } catch {
          return false;
        }
      });
    }

    // Store full link list in memory
    const memResult = await memoryAdd(
      JSON.stringify({
        url,
        filter,
        links: filteredLinks,
        extractedAt: new Date().toISOString(),
      }),
      namespace,
      {
        tags: ['web', 'links', baseHost],
        source: 'web.extract_links',
      }
    );

    if (!memResult.success) {
      return {
        success: false,
        error: `Failed to store links: ${memResult.error}`,
      };
    }

    // Summary with top 5 links
    const topLinks = filteredLinks.slice(0, 5).map((l) => `- ${l.text || l.href}`);
    const summary = `Extracted ${filteredLinks.length} ${filter} links from ${baseHost}.\nTop links:\n${topLinks.join('\n')}${filteredLinks.length > 5 ? '\n...' : ''}`;

    return {
      success: true,
      action: 'allow',
      refId: memResult.referenceId,
      summary,
      data: {
        url,
        linkCount: filteredLinks.length,
        filter,
        message: `Use memory_search("${memResult.referenceId}") for full link list.`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `web.extract_links failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * web.capture_dom_map - Capture DOM structure
 *
 * Analyzes page DOM structure, identifies major components,
 * stores full map in memory, returns summary + refId
 */
export async function captureDomMap(
  url: string,
  options?: {
    namespace?: MemoryNamespace;
  }
): Promise<WebSkillResult> {
  const blocked = checkBlockedPatterns(url);
  if (blocked) return blocked;

  const namespace = options?.namespace || 'short-term';

  try {
    const client = getClient('chrome');
    if (!client || !client.isAvailable()) {
      return {
        success: false,
        error: 'Chrome MCP not available.',
      };
    }

    await client.start();

    // Navigate and analyze DOM
    let domMap: DomMap;

    try {
      await client.callTool('puppeteer_navigate', { url });

      const evalResult = (await client.callTool('puppeteer_evaluate', {
        script: `
          (function() {
            const components = [];
            const selectors = [
              { selector: 'header', type: 'header' },
              { selector: 'nav', type: 'nav' },
              { selector: 'main', type: 'main' },
              { selector: 'article', type: 'article' },
              { selector: 'section', type: 'section' },
              { selector: 'form', type: 'form' },
              { selector: 'ul, ol', type: 'list' },
              { selector: '[class*="card"], [class*="Card"]', type: 'card' },
              { selector: 'footer', type: 'footer' },
            ];

            for (const { selector, type } of selectors) {
              const elements = document.querySelectorAll(selector);
              elements.forEach((el, i) => {
                components.push({
                  type,
                  selector: selector + (elements.length > 1 ? ':nth-of-type(' + (i+1) + ')' : ''),
                  text: el.innerText.substring(0, 100),
                  children: el.children.length
                });
              });
            }

            return JSON.stringify({
              url: window.location.href,
              title: document.title,
              components: components.slice(0, 50)
            });
          })()
        `,
      })) as { result?: string };

      domMap = JSON.parse(evalResult.result || '{}');
    } catch (err) {
      return {
        success: false,
        error: `Failed to capture DOM: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check for CAPTCHA in component texts
    const allText = domMap.components.map((c) => c.text || '').join(' ');
    const captchaCheck = guardCaptcha(allText, url);
    if (captchaCheck) return captchaCheck;

    // Store DOM map in memory
    const memResult = await memoryAdd(
      JSON.stringify({
        ...domMap,
        capturedAt: new Date().toISOString(),
      }),
      namespace,
      {
        tags: ['web', 'dom-map', new URL(url).hostname],
        source: 'web.capture_dom_map',
      }
    );

    if (!memResult.success) {
      return {
        success: false,
        error: `Failed to store DOM map: ${memResult.error}`,
      };
    }

    // Summary
    const typeCounts = domMap.components.reduce(
      (acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const summary = `DOM map for ${domMap.title || url}:\n${Object.entries(typeCounts)
      .map(([type, count]) => `- ${type}: ${count}`)
      .join('\n')}`;

    return {
      success: true,
      action: 'allow',
      refId: memResult.referenceId,
      summary,
      data: {
        url,
        title: domMap.title,
        componentsCount: domMap.components.length,
        typeCounts,
        message: `Use memory_search("${memResult.referenceId}") for full DOM map.`,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `web.capture_dom_map failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Generate summary from page content
 */
function generateSummary(title: string, content: string, url: string): string {
  const hostname = new URL(url).hostname;
  const preview = content.slice(0, 300).replace(/\s+/g, ' ').trim();
  return `${title} (${hostname})\n\n${preview}${content.length > 300 ? '...' : ''}`;
}
