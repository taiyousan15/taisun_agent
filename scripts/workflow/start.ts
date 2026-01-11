#!/usr/bin/env tsx
import { startWorkflow } from '../../src/proxy-mcp/workflow/engine';

const args = process.argv.slice(2);
const workflowId = args[0] || 'video_generation_v1';
const strict = args.includes('--strict');

try {
  const state = startWorkflow(workflowId, strict);
  console.log(`✅ Workflow started: ${state.workflowId}`);
  console.log(`📍 Current phase: ${state.currentPhase}`);
  console.log(`🔒 Strict mode: ${strict ? 'ON' : 'OFF'}`);
  console.log('\n次のステップ: npm run workflow:status');
} catch (error) {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
}
