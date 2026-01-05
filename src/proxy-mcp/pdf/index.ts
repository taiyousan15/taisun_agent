/**
 * PDF Skills - pdf.inspect and pdf.extract_pages
 *
 * Uses pdf-reader-mcp internally but routes through proxy.
 * Large outputs are stored in memory and only summary+refId is returned.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { memoryAdd } from '../tools/memory';
import { ToolResult } from '../types';

const PDF_READER_COMMAND = 'npx';
const PDF_READER_ARGS = ['-y', '@sylphx/pdf-reader-mcp'];

// Default thresholds
const DEFAULT_PAGE_THRESHOLD = 20; // Pages before recommending split extraction
const DEFAULT_MAX_PAGES_PER_EXTRACT = 20; // Max pages per extraction call
const DEFAULT_CONTENT_THRESHOLD = 10000; // Characters before storing in memory

interface PdfSource {
  path?: string;
  url?: string;
  pages?: string | number[];
}

// Types for internal use (kept for documentation purposes)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PdfInspectResult = {
  success: boolean;
  numPages?: number;
  metadata?: Record<string, unknown>;
  recommendedStrategy?: string;
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PdfExtractResult = {
  success: boolean;
  refId?: string;
  summary?: string;
  pageCount?: number;
  extractedPages?: string;
  error?: string;
};

let cachedClient: Client | null = null;
let clientSpawnTime: number = 0;
const CLIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create pdf-reader MCP client
 */
async function getPdfClient(): Promise<Client> {
  const now = Date.now();

  // Reuse cached client if still valid
  if (cachedClient && now - clientSpawnTime < CLIENT_TTL_MS) {
    return cachedClient;
  }

  // Close existing client if expired
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      // Ignore close errors
    }
    cachedClient = null;
  }

  // Create transport with command
  const transport = new StdioClientTransport({
    command: PDF_READER_COMMAND,
    args: PDF_READER_ARGS,
  });

  const client = new Client(
    { name: 'taisun-pdf-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  cachedClient = client;
  clientSpawnTime = now;

  return client;
}

/**
 * Close the cached PDF client
 */
export async function closePdfClient(): Promise<void> {
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      // Ignore
    }
    cachedClient = null;
  }
}

/**
 * pdf.inspect - Get PDF overview without extracting full text
 *
 * Returns page count, metadata, and recommended extraction strategy.
 */
export async function pdfInspect(source: string): Promise<ToolResult> {
  try {
    const client = await getPdfClient();

    // Determine if source is URL or path
    const isUrl = source.startsWith('http://') || source.startsWith('https://');
    const sourceObj: PdfSource = isUrl ? { url: source } : { path: source };

    // Call read_pdf with metadata only (no full text)
    const result = await client.callTool({
      name: 'read_pdf',
      arguments: {
        sources: [sourceObj],
        include_full_text: false,
        include_metadata: true,
        include_page_count: true,
        include_images: false,
      },
    });

    // Parse result
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((c) => c.type === 'text')?.text;

    if (!textContent) {
      return {
        success: false,
        error: 'No response from pdf-reader',
      };
    }

    let parsed: { pages?: Array<{ page_count?: number; metadata?: Record<string, unknown> }> };
    try {
      parsed = JSON.parse(textContent);
    } catch {
      return {
        success: false,
        error: 'Failed to parse pdf-reader response',
      };
    }

    const pageInfo = parsed.pages?.[0];
    const numPages = pageInfo?.page_count ?? 0;
    const metadata = pageInfo?.metadata ?? {};

    // Determine recommended strategy
    let recommendedStrategy: string;
    if (numPages <= 5) {
      recommendedStrategy = 'Extract all pages at once: pdf.extract_pages with pages="1-' + numPages + '"';
    } else if (numPages <= DEFAULT_PAGE_THRESHOLD) {
      recommendedStrategy = `Extract in 2 batches: pages="1-${Math.ceil(numPages / 2)}" then "${Math.ceil(numPages / 2) + 1}-${numPages}"`;
    } else {
      const batches = Math.ceil(numPages / DEFAULT_MAX_PAGES_PER_EXTRACT);
      recommendedStrategy = `Large PDF (${numPages} pages). Extract in ${batches} batches of ${DEFAULT_MAX_PAGES_PER_EXTRACT} pages each. Start with pages="1-5" to get overview/TOC.`;
    }

    return {
      success: true,
      data: {
        source,
        numPages,
        metadata: {
          title: metadata.Title || metadata.title,
          author: metadata.Author || metadata.author,
          subject: metadata.Subject || metadata.subject,
          creator: metadata.Creator || metadata.creator,
          creationDate: metadata.CreationDate || metadata.creationDate,
        },
        recommendedStrategy,
        thresholds: {
          pageThreshold: DEFAULT_PAGE_THRESHOLD,
          maxPagesPerExtract: DEFAULT_MAX_PAGES_PER_EXTRACT,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `pdf.inspect failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * pdf.extract_pages - Extract text from specific page range
 *
 * Large outputs are stored in memory, only summary+refId returned.
 */
export async function pdfExtractPages(
  source: string,
  pages: string,
  options: {
    includeImages?: boolean;
    namespace?: 'short-term' | 'long-term';
  } = {}
): Promise<ToolResult> {
  try {
    const client = await getPdfClient();

    // Determine if source is URL or path
    const isUrl = source.startsWith('http://') || source.startsWith('https://');
    const sourceObj: PdfSource = isUrl
      ? { url: source, pages }
      : { path: source, pages };

    // Call read_pdf with full text
    const result = await client.callTool({
      name: 'read_pdf',
      arguments: {
        sources: [sourceObj],
        include_full_text: true,
        include_metadata: false,
        include_page_count: true,
        include_images: options.includeImages ?? false,
      },
    });

    // Parse result
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((c) => c.type === 'text')?.text;

    if (!textContent) {
      return {
        success: false,
        error: 'No response from pdf-reader',
      };
    }

    let parsed: {
      pages?: Array<{
        page_count?: number;
        text?: string;
        page_texts?: Array<{ page: number; text: string }>;
      }>;
    };
    try {
      parsed = JSON.parse(textContent);
    } catch {
      return {
        success: false,
        error: 'Failed to parse pdf-reader response',
      };
    }

    const pageInfo = parsed.pages?.[0];
    const pageTexts = pageInfo?.page_texts ?? [];
    const fullText = pageInfo?.text || pageTexts.map((p) => p.text).join('\n\n---PAGE---\n\n');

    // Calculate content size
    const contentSize = fullText.length;
    const pageCount = pageTexts.length;

    // Generate summary
    const summaryLines = fullText.substring(0, 500).split('\n').slice(0, 5);
    const summary = summaryLines.join('\n') + (contentSize > 500 ? '...' : '');

    // If content is large, store in memory
    if (contentSize > DEFAULT_CONTENT_THRESHOLD) {
      const memResult = await memoryAdd(
        JSON.stringify({
          source,
          pages,
          pageCount,
          pageTexts,
          extractedAt: new Date().toISOString(),
        }),
        options.namespace ?? 'short-term',
        {
          tags: ['pdf-extract'],
          source,
          metadata: {
            pages,
            pageCount,
            contentSize,
          },
        }
      );

      if (!memResult.success) {
        return {
          success: false,
          error: `Failed to store extracted content: ${memResult.error}`,
        };
      }

      return {
        success: true,
        referenceId: memResult.referenceId,
        data: {
          source,
          extractedPages: pages,
          pageCount,
          contentSize,
          summary,
          storedInMemory: true,
          message: `Extracted ${pageCount} pages (${contentSize} chars). Full content stored in memory. Use memory.search with refId to retrieve.`,
        },
      };
    }

    // Content is small enough to return directly (but still store for reference)
    const memResult = await memoryAdd(
      JSON.stringify({
        source,
        pages,
        pageCount,
        pageTexts,
        extractedAt: new Date().toISOString(),
      }),
      options.namespace ?? 'short-term',
      {
        tags: ['pdf-extract'],
        source,
        metadata: {
          pages,
          pageCount,
          contentSize,
        },
      }
    );

    return {
      success: true,
      referenceId: memResult.referenceId,
      data: {
        source,
        extractedPages: pages,
        pageCount,
        contentSize,
        summary,
        storedInMemory: true,
        message: `Extracted ${pageCount} pages (${contentSize} chars). Content stored in memory for future reference.`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `pdf.extract_pages failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if input likely refers to a PDF
 */
export function isPdfReference(input: string): boolean {
  // Check for .pdf extension in paths or URLs (case insensitive)
  if (/\.(pdf)\b/i.test(input)) {
    return true;
  }

  // Check for PDF-related URLs
  if (/https?:\/\/[^\s]+\.pdf(\?[^\s]*)?/i.test(input)) {
    return true;
  }

  return false;
}
