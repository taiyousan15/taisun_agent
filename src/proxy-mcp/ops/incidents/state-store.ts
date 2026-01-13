/**
 * Incident State Store - P17
 *
 * Persistent storage for incident state (JSONL format)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import type {
  IIncidentStateStore,
  IncidentState,
  IncidentStatus,
  IncidentSeverity,
  StateStoreConfig,
} from './types';

/**
 * JSONL-based incident state store
 *
 * Uses append-only JSONL for durability, with periodic compaction
 */
export class JsonlIncidentStateStore implements IIncidentStateStore {
  private cache: Map<string, IncidentState> = new Map();
  private readonly path: string;
  private readonly maxEntries: number;
  private readonly retentionDays: number;
  private initialized = false;

  constructor(config: StateStoreConfig) {
    this.path = config.path;
    this.maxEntries = config.maxEntries;
    this.retentionDays = config.retentionDays;
  }

  /**
   * Initialize the store (load existing data)
   */
  private async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing data
    if (existsSync(this.path)) {
      try {
        const content = readFileSync(this.path, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const state = JSON.parse(line) as IncidentState;
            this.cache.set(state.incidentKey, state);
          } catch {
            // Skip invalid lines
          }
        }
      } catch {
        // Start fresh if file is corrupted
        this.cache.clear();
      }
    }

    this.initialized = true;
  }

  /**
   * Get incident state by key
   */
  async get(incidentKey: string): Promise<IncidentState | null> {
    await this.init();
    return this.cache.get(incidentKey) || null;
  }

  /**
   * Set incident state
   */
  async set(state: IncidentState): Promise<void> {
    await this.init();

    // Update cache
    this.cache.set(state.incidentKey, state);

    // Append to file
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(this.path, JSON.stringify(state) + '\n');

    // Compact if needed
    if (this.cache.size > this.maxEntries * 1.5) {
      await this.compact();
    }
  }

  /**
   * Get all incident states
   */
  async getAll(): Promise<IncidentState[]> {
    await this.init();
    return Array.from(this.cache.values());
  }

  /**
   * Get incidents by status
   */
  async getByStatus(status: IncidentStatus): Promise<IncidentState[]> {
    await this.init();
    return Array.from(this.cache.values()).filter(
      (state) => state.currentStatus === status
    );
  }

  /**
   * Get incidents by severity
   */
  async getBySeverity(severity: IncidentSeverity): Promise<IncidentState[]> {
    await this.init();
    return Array.from(this.cache.values()).filter(
      (state) => state.severity === severity
    );
  }

  /**
   * Get incidents from recent N days
   */
  async getRecent(days: number): Promise<IncidentState[]> {
    await this.init();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    return Array.from(this.cache.values()).filter(
      (state) => state.lastSeen >= cutoffStr
    );
  }

  /**
   * Cleanup old entries
   */
  async cleanup(retentionDays: number): Promise<number> {
    await this.init();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString();

    let removed = 0;
    for (const [key, state] of this.cache.entries()) {
      // Only remove resolved incidents older than retention
      if (state.currentStatus === 'resolved' && state.lastSeen < cutoffStr) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      await this.compact();
    }

    return removed;
  }

  /**
   * Compact the store (rewrite without duplicates)
   */
  private async compact(): Promise<void> {
    // Keep only up to maxEntries, removing oldest resolved first
    if (this.cache.size > this.maxEntries) {
      const entries = Array.from(this.cache.entries());

      // Sort: active first, then by lastSeen descending
      entries.sort((a, b) => {
        if (a[1].currentStatus !== b[1].currentStatus) {
          return a[1].currentStatus === 'active' ? -1 : 1;
        }
        return b[1].lastSeen.localeCompare(a[1].lastSeen);
      });

      // Keep only maxEntries
      this.cache = new Map(entries.slice(0, this.maxEntries));
    }

    // Rewrite file
    const lines = Array.from(this.cache.values())
      .map((state) => JSON.stringify(state))
      .join('\n');

    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.path, lines + '\n');
  }
}

/**
 * In-memory incident state store (for testing)
 */
export class InMemoryIncidentStateStore implements IIncidentStateStore {
  private cache: Map<string, IncidentState> = new Map();

  async get(incidentKey: string): Promise<IncidentState | null> {
    return this.cache.get(incidentKey) || null;
  }

  async set(state: IncidentState): Promise<void> {
    this.cache.set(state.incidentKey, state);
  }

  async getAll(): Promise<IncidentState[]> {
    return Array.from(this.cache.values());
  }

  async getByStatus(status: IncidentStatus): Promise<IncidentState[]> {
    return Array.from(this.cache.values()).filter(
      (state) => state.currentStatus === status
    );
  }

  async getBySeverity(severity: IncidentSeverity): Promise<IncidentState[]> {
    return Array.from(this.cache.values()).filter(
      (state) => state.severity === severity
    );
  }

  async getRecent(days: number): Promise<IncidentState[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();

    return Array.from(this.cache.values()).filter(
      (state) => state.lastSeen >= cutoffStr
    );
  }

  async cleanup(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString();

    let removed = 0;
    for (const [key, state] of this.cache.entries()) {
      if (state.currentStatus === 'resolved' && state.lastSeen < cutoffStr) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Create a state store based on config
 */
export function createStateStore(config: StateStoreConfig): IIncidentStateStore {
  if (config.type === 'memory') {
    return new InMemoryIncidentStateStore();
  }
  return new JsonlIncidentStateStore(config);
}
