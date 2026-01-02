/**
 * CDP Browser Actions
 *
 * High-level browser actions using Playwright CDP connection.
 * Results use minimal output with refId for large data.
 */

import { Page } from 'playwright-core';
import { connectCDP } from './session';
import {
  CDPConfig,
  CDPActionResult,
  PageContent,
  ExtractedLinks,
  DOMMap,
  LinkInfo,
  DOMElement,
  detectCaptchaOrLogin,
} from './types';

/** Max preview length for content */
const CONTENT_PREVIEW_LENGTH = 500;
/** Max links in preview */
const LINKS_PREVIEW_COUNT = 20;
/** Max elements in preview */
const ELEMENTS_PREVIEW_COUNT = 50;

/**
 * Read URL content via CDP
 */
export async function readUrlViaCDP(
  url: string,
  config?: Partial<CDPConfig>
): Promise<CDPActionResult<PageContent>> {
  let page: Page | null = null;

  try {
    const connection = await connectCDP(config);
    page = await connection.context.newPage();

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config?.timeout || 30000,
    });

    const title = await page.title();
    const content = await page.evaluate(() => document.body?.innerText || '');

    // Check for CAPTCHA/login
    const captchaCheck = detectCaptchaOrLogin(title, content, url);
    if (captchaCheck.detected) {
      return {
        success: false,
        requireHuman: true,
        humanReason: captchaCheck.reason,
        error: 'CAPTCHA or login required. Please resolve manually and retry.',
      };
    }

    const result: PageContent = {
      url: page.url(),
      title,
      content,
      contentPreview:
        content.length > CONTENT_PREVIEW_LENGTH
          ? content.substring(0, CONTENT_PREVIEW_LENGTH) + '...'
          : content,
    };

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read URL: ${err}`,
    };
  } finally {
    // Close page but keep browser running
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Extract links from URL via CDP
 */
export async function extractLinksViaCDP(
  url: string,
  config?: Partial<CDPConfig>
): Promise<CDPActionResult<ExtractedLinks>> {
  let page: Page | null = null;

  try {
    const connection = await connectCDP(config);
    page = await connection.context.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config?.timeout || 30000,
    });

    const title = await page.title();
    const content = await page.evaluate(() => document.body?.innerText || '');

    // Check for CAPTCHA/login
    const captchaCheck = detectCaptchaOrLogin(title, content, url);
    if (captchaCheck.detected) {
      return {
        success: false,
        requireHuman: true,
        humanReason: captchaCheck.reason,
        error: 'CAPTCHA or login required. Please resolve manually and retry.',
      };
    }

    // Extract all links
    const links: LinkInfo[] = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLAnchorElement).innerText?.trim() || '',
        title: (a as HTMLAnchorElement).title || undefined,
      }));
    });

    const result: ExtractedLinks = {
      url: page.url(),
      title,
      links,
      totalLinks: links.length,
      linksPreview: links.slice(0, LINKS_PREVIEW_COUNT),
    };

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: `Failed to extract links: ${err}`,
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Capture DOM map via CDP
 */
export async function captureDOMMapViaCDP(
  url: string,
  config?: Partial<CDPConfig>
): Promise<CDPActionResult<DOMMap>> {
  let page: Page | null = null;

  try {
    const connection = await connectCDP(config);
    page = await connection.context.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config?.timeout || 30000,
    });

    const title = await page.title();
    const content = await page.evaluate(() => document.body?.innerText || '');

    // Check for CAPTCHA/login
    const captchaCheck = detectCaptchaOrLogin(title, content, url);
    if (captchaCheck.detected) {
      return {
        success: false,
        requireHuman: true,
        humanReason: captchaCheck.reason,
        error: 'CAPTCHA or login required. Please resolve manually and retry.',
      };
    }

    // Extract DOM structure (simplified)
    const elements: DOMElement[] = await page.evaluate(() => {
      function extractElement(el: Element, depth: number = 0): DOMElement | null {
        if (depth > 5) return null; // Limit depth

        const tag = el.tagName.toLowerCase();
        // Skip script, style, and other non-content elements
        if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) {
          return null;
        }

        const result: DOMElement = { tag };

        if (el.id) result.id = el.id;
        if (el.className && typeof el.className === 'string') {
          result.classes = el.className.split(/\s+/).filter(Boolean);
        }

        // Get direct text content (not from children)
        const textContent = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .filter(Boolean)
          .join(' ');

        if (textContent) {
          result.text = textContent.substring(0, 100);
        }

        // Process children
        const children: DOMElement[] = [];
        for (const child of Array.from(el.children)) {
          const childEl = extractElement(child, depth + 1);
          if (childEl) children.push(childEl);
        }
        if (children.length > 0) {
          result.children = children;
        }

        return result;
      }

      const body = document.body;
      if (!body) return [];

      const root = extractElement(body, 0);
      return root ? [root] : [];
    });

    // Flatten elements for counting
    const countElements = (els: DOMElement[]): number => {
      let count = els.length;
      for (const el of els) {
        if (el.children) {
          count += countElements(el.children);
        }
      }
      return count;
    };

    const totalElements = countElements(elements);

    const result: DOMMap = {
      url: page.url(),
      title,
      elements,
      totalElements,
      elementsPreview: elements.slice(0, ELEMENTS_PREVIEW_COUNT),
    };

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: `Failed to capture DOM map: ${err}`,
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
