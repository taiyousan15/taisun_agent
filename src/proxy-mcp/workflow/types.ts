/**
 * Workflow Type Definitions
 * Phase 1: State Management Only (no strict enforcement)
 */

export interface WorkflowValidation {
  type: 'file_exists' | 'command' | 'json_schema';
  target?: string;
  command?: string;
  schema?: string;
  errorMessage: string;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  description?: string;
  allowedSkills?: string[];
  requiredArtifacts?: string[];
  validations?: WorkflowValidation[];
  nextPhase: string | null;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  phases: WorkflowPhase[];
}

export interface WorkflowState {
  workflowId: string;
  currentPhase: string;
  completedPhases: string[];
  startedAt: string;
  lastUpdatedAt: string;
  strict: boolean;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface CanRunSkillResult {
  ok: boolean;
  reason?: string;
  suggestedNext?: string;
}

export interface PhaseTransitionResult {
  success: boolean;
  newPhase?: string;
  errors: string[];
  message: string;
}
