/**
 * Supervisor Graph - M6
 *
 * State machine for supervised execution
 *
 * Graph flow:
 * ingest → route → plan → (approval?) → execute_safe → finalize
 */

import {
  SupervisorState,
  SupervisorStep,
  SupervisorOptions,
  SupervisorResult,
  ExecutionPlan,
  RouteDecision,
} from './types';
import { checkDangerousPatterns, requiresApproval, createPlanStep, validatePlan } from './policy';
import {
  createRunlogIssue,
  createApprovalIssue,
  checkApproval,
  addIssueComment,
  closeIssue,
} from './github';
import { route as routeToMcp } from '../router';
import { getAllMcps, getRouterConfig } from '../internal/registry';
import { memoryAdd } from '../tools/memory';
import { MemoryNamespace } from '../memory/types';

/**
 * Generate unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Create initial state
 */
function createInitialState(input: string, options: SupervisorOptions = {}): SupervisorState {
  return {
    runId: options.runId || generateRunId(),
    input,
    step: 'ingest',
    requiresApproval: false,
    refIds: [],
    timestamps: {
      started: new Date().toISOString(),
    },
  };
}

/**
 * Ingest step: Parse and validate input
 */
async function ingestStep(state: SupervisorState): Promise<SupervisorState> {
  // Check for dangerous patterns in input
  const dangerousPatterns = checkDangerousPatterns(state.input);

  // Create RUNLOG issue if gh is available
  const runlogIssue = await createRunlogIssue(state);

  return {
    ...state,
    step: 'route',
    runlogIssue: runlogIssue || undefined,
    route: dangerousPatterns.length > 0
      ? {
          action: 'require_human',
          reason: `Dangerous patterns detected: ${dangerousPatterns.join(', ')}`,
          confidence: 1.0,
          dangerousPatterns,
        }
      : undefined,
  };
}

/**
 * Route step: Determine target MCP and action
 */
async function routeStep(state: SupervisorState): Promise<SupervisorState> {
  // If already marked as require_human from ingest, keep that
  if (state.route?.action === 'require_human') {
    return {
      ...state,
      step: 'plan',
      requiresApproval: true,
    };
  }

  // Use the router to find target MCP
  const mcps = getAllMcps();
  const config = getRouterConfig();
  const routeResult = routeToMcp(state.input, mcps, config);

  const route: RouteDecision = {
    action: routeResult.action,
    reason: routeResult.reason,
    targetMcp: routeResult.candidates?.[0]?.name,
    confidence: routeResult.confidence ?? 0,
    dangerousPatterns: routeResult.matchedRule?.includes('dangerous')
      ? [routeResult.matchedRule]
      : undefined,
  };

  const needsApproval = requiresApproval(state.input, route);

  return {
    ...state,
    step: 'plan',
    route,
    requiresApproval: needsApproval,
  };
}

/**
 * Plan step: Create execution plan
 */
async function planStep(state: SupervisorState): Promise<SupervisorState> {
  const dangerousPatterns = checkDangerousPatterns(state.input);
  const needsApproval = dangerousPatterns.length > 0 || state.requiresApproval;

  // Create simple execution plan
  const plan: ExecutionPlan = {
    steps: [
      createPlanStep('1', 'analyze', state.input.substring(0, 100)),
      createPlanStep('2', state.route?.targetMcp || 'process', 'user input'),
    ],
    estimatedRisk: dangerousPatterns.length > 0 ? 'high' : 'low',
    requiresApproval: needsApproval,
    approvalReason: needsApproval
      ? `Detected patterns: ${dangerousPatterns.join(', ') || 'requires human review'}`
      : undefined,
  };

  // Log plan to RUNLOG
  if (state.runlogIssue) {
    await addIssueComment(
      state.runlogIssue,
      `## Plan Created\n\n**Risk:** ${plan.estimatedRisk}\n**Requires Approval:** ${plan.requiresApproval}\n\n${plan.steps.map((s) => `- ${s.action}`).join('\n')}`
    );
  }

  return {
    ...state,
    step: needsApproval ? 'approval' : 'execute_safe',
    plan,
    requiresApproval: needsApproval,
  };
}

/**
 * Approval step: Wait for human approval
 */
async function approvalStep(state: SupervisorState): Promise<SupervisorState> {
  if (!state.plan) {
    return {
      ...state,
      step: 'error',
      error: 'No plan available for approval',
    };
  }

  // Create approval issue
  const approvalIssue = await createApprovalIssue(state, state.plan);

  if (!approvalIssue) {
    // If we can't create an issue, we can't proceed
    return {
      ...state,
      step: 'error',
      error: 'Could not create approval issue. Manual approval required.',
      approval: {
        required: true,
        approved: false,
        reason: 'Approval issue creation failed',
      },
    };
  }

  // Log to RUNLOG
  if (state.runlogIssue) {
    await addIssueComment(
      state.runlogIssue,
      `## Approval Required\n\nWaiting for approval on issue #${approvalIssue}\n\nThis run is paused until approval is granted.`
    );
  }

  return {
    ...state,
    step: 'approval', // Stay in approval state - paused
    approval: {
      required: true,
      approved: false,
      issueId: approvalIssue,
      reason: state.plan.approvalReason,
    },
  };
}

/**
 * Execute safe step: Execute the plan safely
 */
async function executeSafeStep(
  state: SupervisorState,
  namespace: MemoryNamespace = 'short-term'
): Promise<SupervisorState> {
  // Validate plan is safe to execute
  if (state.plan) {
    const validation = validatePlan(state.plan, state.approval?.approved || false);
    if (!validation.valid) {
      return {
        ...state,
        step: 'error',
        error: validation.reason,
      };
    }
  }

  // Execute (placeholder - actual execution depends on the MCP)
  const summary = `Executed plan for: ${state.input.substring(0, 100)}`;

  // Store result in memory
  const memResult = await memoryAdd(
    JSON.stringify({
      runId: state.runId,
      input: state.input,
      route: state.route,
      plan: state.plan,
      executedAt: new Date().toISOString(),
    }),
    namespace,
    {
      tags: ['supervisor', 'execution', state.runId],
      source: 'supervisor',
    }
  );

  // Log to RUNLOG
  if (state.runlogIssue) {
    await addIssueComment(
      state.runlogIssue,
      `## Execution Complete\n\n**Summary:** ${summary}\n**RefId:** ${memResult.referenceId || 'N/A'}`
    );
  }

  return {
    ...state,
    step: 'finalize',
    result: {
      success: true,
      summary,
      refId: memResult.referenceId,
    },
    refIds: memResult.referenceId ? [...state.refIds, memResult.referenceId] : state.refIds,
  };
}

/**
 * Finalize step: Complete the run
 */
async function finalizeStep(state: SupervisorState): Promise<SupervisorState> {
  const completedAt = new Date().toISOString();

  // Close RUNLOG issue if exists
  if (state.runlogIssue) {
    await closeIssue(
      state.runlogIssue,
      `## Run Completed\n\n**Success:** ${state.result?.success || false}\n**Completed:** ${completedAt}\n**RefIds:** ${state.refIds.join(', ') || 'N/A'}`
    );
  }

  return {
    ...state,
    step: 'finalize',
    timestamps: {
      ...state.timestamps,
      completed: completedAt,
    },
  };
}

/**
 * Error step: Handle errors
 */
async function errorStep(state: SupervisorState): Promise<SupervisorState> {
  // Log error to RUNLOG
  if (state.runlogIssue) {
    await addIssueComment(
      state.runlogIssue,
      `## Error\n\n**Error:** ${state.error || 'Unknown error'}\n\nRun aborted.`
    );
  }

  return {
    ...state,
    step: 'error',
    timestamps: {
      ...state.timestamps,
      completed: new Date().toISOString(),
    },
  };
}

/**
 * Run the supervisor state machine
 */
export async function runSupervisor(
  input: string,
  options: SupervisorOptions = {}
): Promise<SupervisorResult> {
  const namespace: MemoryNamespace = options.namespace || 'short-term';
  let state = createInitialState(input, options);
  const maxSteps = options.maxSteps || 10;
  let stepCount = 0;

  try {
    while (stepCount < maxSteps) {
      stepCount++;

      switch (state.step) {
        case 'ingest':
          state = await ingestStep(state);
          break;

        case 'route':
          state = await routeStep(state);
          break;

        case 'plan':
          state = await planStep(state);
          break;

        case 'approval':
          // If approval required and not yet approved, pause here
          if (state.requiresApproval && !state.approval?.approved) {
            state = await approvalStep(state);
            // Return paused state
            return {
              success: false,
              runId: state.runId,
              step: state.step,
              summary: 'Waiting for approval',
              requiresApproval: true,
              approvalIssue: state.approval?.issueId,
              data: {
                runlogIssue: state.runlogIssue,
                timestamps: state.timestamps,
                plan: state.plan,
              },
            };
          }
          // If approved, move to execute
          state = { ...state, step: 'execute_safe' };
          break;

        case 'execute_safe':
          state = await executeSafeStep(state, namespace);
          break;

        case 'finalize':
          state = await finalizeStep(state);
          // Done
          return {
            success: state.result?.success || false,
            runId: state.runId,
            step: state.step,
            summary: state.result?.summary,
            refId: state.result?.refId,
            requiresApproval: state.requiresApproval,
            data: {
              runlogIssue: state.runlogIssue,
              timestamps: state.timestamps,
            },
          };

        case 'error':
          state = await errorStep(state);
          return {
            success: false,
            runId: state.runId,
            step: state.step,
            requiresApproval: state.requiresApproval,
            error: state.error,
            data: {
              runlogIssue: state.runlogIssue,
              timestamps: state.timestamps,
            },
          };

        default:
          return {
            success: false,
            runId: state.runId,
            step: 'error',
            requiresApproval: false,
            error: `Unknown step: ${state.step}`,
          };
      }
    }

    // Max steps reached
    return {
      success: false,
      runId: state.runId,
      step: 'error',
      requiresApproval: state.requiresApproval,
      error: `Max steps (${maxSteps}) reached`,
    };
  } catch (err) {
    return {
      success: false,
      runId: state.runId,
      step: 'error',
      requiresApproval: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resume a paused supervisor run
 */
export async function resumeSupervisor(
  runId: string,
  approvalIssueId: number,
  options: SupervisorOptions = {}
): Promise<SupervisorResult> {
  // Check approval status
  const approvalStatus = await checkApproval(approvalIssueId);

  if (!approvalStatus.approved) {
    return {
      success: false,
      runId,
      step: 'approval',
      summary: 'Still waiting for approval',
      requiresApproval: true,
      approvalIssue: approvalIssueId,
    };
  }

  // Approval granted - continue execution
  // Note: In a real implementation, we would restore the full state
  return {
    success: true,
    runId,
    step: 'execute_safe',
    summary: `Approval granted by ${approvalStatus.approvedBy}. Execution can proceed.`,
    requiresApproval: false,
    data: {
      approvedBy: approvalStatus.approvedBy,
    },
  };
}

/**
 * Create supervisor graph (simplified - for compatibility)
 */
export function createSupervisorGraph(options: SupervisorOptions = {}) {
  return {
    invoke: async (input: string) => runSupervisor(input, options),
  };
}
