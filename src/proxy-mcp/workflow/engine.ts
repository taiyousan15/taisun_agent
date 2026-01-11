/**
 * Workflow Engine
 * Core state machine logic for workflow execution
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { loadState, saveState, clearState } from './store';
import { getWorkflow } from './registry';
import type {
  WorkflowState,
  WorkflowPhase,
  ValidationResult,
  CanRunSkillResult,
  PhaseTransitionResult,
} from './types';

/**
 * Start a new workflow
 */
export function startWorkflow(
  workflowId: string,
  strict: boolean = false,
  metadata?: Record<string, unknown>
): WorkflowState {
  // Load workflow definition to validate it exists
  const workflow = getWorkflow(workflowId);

  // Clear existing state if any
  clearState();

  // Create new state
  const state: WorkflowState = {
    workflowId,
    currentPhase: workflow.phases[0].id,
    completedPhases: [],
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    strict,
    metadata: metadata || {},
  };

  saveState(state);
  return state;
}

/**
 * Get current workflow status
 */
export function getStatus(): {
  active: boolean;
  state: WorkflowState | null;
  currentPhase: WorkflowPhase | null;
  nextPhase: WorkflowPhase | null;
  progress: string;
} {
  const state = loadState();

  if (!state) {
    return {
      active: false,
      state: null,
      currentPhase: null,
      nextPhase: null,
      progress: '0/0 (No active workflow)',
    };
  }

  const workflow = getWorkflow(state.workflowId);
  const currentPhase = workflow.phases.find((p) => p.id === state.currentPhase);
  const nextPhaseId = currentPhase?.nextPhase;
  const nextPhase = nextPhaseId
    ? (workflow.phases.find((p) => p.id === nextPhaseId) ?? null)
    : null;

  const progress = `${state.completedPhases.length + 1}/${workflow.phases.length}`;

  return {
    active: true,
    state,
    currentPhase: currentPhase || null,
    nextPhase,
    progress,
  };
}

/**
 * Check if a skill can run in the current phase (Phase 1: advisory only)
 */
export function canRunSkill(skillName: string): CanRunSkillResult {
  const state = loadState();

  if (!state) {
    return { ok: true };
  }

  const workflow = getWorkflow(state.workflowId);
  const currentPhase = workflow.phases.find((p) => p.id === state.currentPhase);

  if (!currentPhase) {
    return { ok: true };
  }

  // Phase 1: No enforcement, just advisory
  if (!currentPhase.allowedSkills || currentPhase.allowedSkills.length === 0) {
    return { ok: true };
  }

  const allowed = currentPhase.allowedSkills.includes(skillName);

  if (!allowed) {
    return {
      ok: true, // Phase 1: Don't block, just warn
      reason: `スキル '${skillName}' は Phase ${currentPhase.id} では推奨されていません。`,
      suggestedNext: `推奨スキル: ${currentPhase.allowedSkills.join(', ')}`,
    };
  }

  return { ok: true };
}

/**
 * Validate current phase completion
 */
export function validatePhase(): ValidationResult {
  const state = loadState();

  if (!state) {
    return {
      passed: false,
      errors: ['No active workflow'],
      warnings: [],
    };
  }

  const workflow = getWorkflow(state.workflowId);
  const currentPhase = workflow.phases.find((p) => p.id === state.currentPhase);

  if (!currentPhase) {
    return {
      passed: false,
      errors: [`Phase ${state.currentPhase} not found in workflow definition`],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required artifacts
  if (currentPhase.requiredArtifacts) {
    for (const artifact of currentPhase.requiredArtifacts) {
      if (!fs.existsSync(artifact)) {
        errors.push(`必須成果物が見つかりません: ${artifact}`);
      }
    }
  }

  // Run validations
  if (currentPhase.validations) {
    for (const validation of currentPhase.validations) {
      try {
        if (validation.type === 'file_exists' && validation.target) {
          if (!fs.existsSync(validation.target)) {
            errors.push(validation.errorMessage);
          }
        } else if (validation.type === 'command' && validation.command) {
          try {
            execSync(validation.command, { stdio: 'pipe' });
          } catch {
            errors.push(validation.errorMessage);
          }
        }
      } catch (error) {
        const err = error as Error;
        errors.push(`検証エラー: ${err.message}`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Transition to next phase
 */
export function transitionToNextPhase(): PhaseTransitionResult {
  const state = loadState();

  if (!state) {
    return {
      success: false,
      errors: ['No active workflow'],
      message: 'ワークフローが開始されていません',
    };
  }

  const workflow = getWorkflow(state.workflowId);
  const currentPhase = workflow.phases.find((p) => p.id === state.currentPhase);

  if (!currentPhase) {
    return {
      success: false,
      errors: [`Phase ${state.currentPhase} not found`],
      message: 'フェーズが見つかりません',
    };
  }

  // Validate current phase
  const validation = validatePhase();
  if (!validation.passed) {
    return {
      success: false,
      errors: validation.errors,
      message: `Phase ${currentPhase.id} の完了条件を満たしていません`,
    };
  }

  // Check if this is the final phase
  if (!currentPhase.nextPhase) {
    return {
      success: false,
      errors: [],
      message: `Phase ${currentPhase.id} は最終フェーズです。/workflow-verify で完了を確認してください。`,
    };
  }

  // Move to next phase
  state.completedPhases.push(state.currentPhase);
  state.currentPhase = currentPhase.nextPhase;
  saveState(state);

  return {
    success: true,
    newPhase: currentPhase.nextPhase,
    errors: [],
    message: `✅ Phase ${currentPhase.nextPhase} に進みました`,
  };
}

/**
 * Verify workflow completion
 */
export function verifyCompletion(): ValidationResult {
  const state = loadState();

  if (!state) {
    return {
      passed: false,
      errors: ['No active workflow'],
      warnings: [],
    };
  }

  const workflow = getWorkflow(state.workflowId);
  const currentPhase = workflow.phases.find((p) => p.id === state.currentPhase);

  if (!currentPhase) {
    return {
      passed: false,
      errors: ['Current phase not found'],
      warnings: [],
    };
  }

  // Check if current phase is the final phase
  if (currentPhase.nextPhase !== null) {
    const remaining = workflow.phases.filter(
      (p) => !state.completedPhases.includes(p.id) && p.id !== state.currentPhase
    );

    return {
      passed: false,
      errors: [
        `ワークフローは完了していません。残りフェーズ: ${remaining.map((p) => p.id).join(', ')}`,
      ],
      warnings: [],
    };
  }

  // Validate final phase
  const validation = validatePhase();

  if (!validation.passed) {
    return {
      passed: false,
      errors: [`最終フェーズの完了条件を満たしていません`, ...validation.errors],
      warnings: validation.warnings,
    };
  }

  return {
    passed: true,
    errors: [],
    warnings: [],
  };
}
