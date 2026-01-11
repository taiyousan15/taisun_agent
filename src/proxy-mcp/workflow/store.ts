/**
 * Workflow State Store
 * Handles .workflow_state.json persistence with UTF-8 safety
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WorkflowState } from './types';

const STATE_FILE = '.workflow_state.json';

/**
 * Get the state file path (project root)
 */
function getStateFilePath(): string {
  return path.join(process.cwd(), STATE_FILE);
}

/**
 * Load workflow state from .workflow_state.json
 * Returns null if file doesn't exist
 */
export function loadState(): WorkflowState | null {
  const filePath = getStateFilePath();

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const state = JSON.parse(content) as WorkflowState;
    return state;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to load workflow state: ${err.message}`);
  }
}

/**
 * Save workflow state to .workflow_state.json (atomic write)
 */
export function saveState(state: WorkflowState): void {
  const filePath = getStateFilePath();
  const tmpPath = `${filePath}.tmp`;

  try {
    // Update timestamp
    state.lastUpdatedAt = new Date().toISOString();

    // Write to temp file first (atomic)
    const content = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpPath, content, 'utf-8');

    // Rename (atomic on POSIX, near-atomic on Windows)
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // Cleanup temp file on error
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    const err = error as Error;
    throw new Error(`Failed to save workflow state: ${err.message}`);
  }
}

/**
 * Clear workflow state (delete .workflow_state.json)
 */
export function clearState(): void {
  const filePath = getStateFilePath();

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Check if workflow state exists
 */
export function hasState(): boolean {
  const filePath = getStateFilePath();
  return fs.existsSync(filePath);
}
