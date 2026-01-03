# P11: Security & Governance Hardening

## Overview

P11 implements comprehensive security and governance hardening for the proxy-mcp system:

1. **Secrets Guard** - Prevents secrets from leaking to logs/memory
2. **Policy-as-Code** - Configurable safety rules in JSON
3. **Approval Binding** - Plan hash + TTL validation to prevent attacks

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Security & Governance                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────────┐ │
│  │   Secrets    │   │   Policy     │   │    Approval Binding          │ │
│  │   Guard      │   │   Engine     │   │                              │ │
│  │              │   │              │   │  ┌─────────────────────────┐ │ │
│  │  • Redact    │   │  • Load JSON │   │  │  Plan Hash (SHA-256)   │ │ │
│  │  • Patterns  │   │  • Evaluate  │   │  │  + TTL (24h default)   │ │ │
│  │  • Allowlist │   │  • Override  │   │  └─────────────────────────┘ │ │
│  └──────────────┘   └──────────────┘   └──────────────────────────────┘ │
│         │                 │                        │                     │
│         ▼                 ▼                        ▼                     │
│  ┌──────────────────────────────────────────────────────────────────────┤
│  │                    Integration Points                                │
│  │                                                                       │
│  │  Observability    Memory       Router        Supervisor              │
│  │  (recordEvent)    (add)        (rules)       (approval)              │
│  └──────────────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Secrets Guard

### Redaction System

Located in `src/proxy-mcp/security/`:

```typescript
import { redactSecrets, redactObject, containsSecrets } from './security';

// String redaction
const result = redactSecrets('API key: sk-abcdefg12345...');
// { redacted: 'API key: [REDACTED:OPENAI_KEY]', patterns: ['openai_key'] }

// Object redaction (recursive)
const safeData = redactObject({ apiKey: 'sk-...' });
```

### Supported Patterns

| Provider | Pattern | Example |
|----------|---------|---------|
| GitHub PAT | `ghp_[a-zA-Z0-9]{36}` | `ghp_abc...` |
| GitHub Fine-grained | `github_pat_[a-zA-Z0-9_]{22,}` | `github_pat_...` |
| AWS Access Key | `AKIA[A-Z0-9]{16}` | `AKIAIOSFODNN...` |
| AWS Secret Key | `[a-zA-Z0-9+/]{40}` | Base64-like |
| Slack Token | `xox[baprs]-[0-9a-zA-Z-]+` | `xoxb-...` |
| OpenAI Key | `sk-[a-zA-Z0-9]{48}` | `sk-...` |
| Stripe | `[rs]k_(test\|live)_[a-zA-Z0-9]+` | `sk_live_...` |
| Notion | `secret_[a-zA-Z0-9]{43}` | `secret_...` |
| Google API | `AIza[a-zA-Z0-9_-]{35}` | `AIzaSy...` |

### Allowlist

False positives are prevented with the allowlist:
- `example`, `dummy`, `placeholder`
- `test`, `sample`, `mock`
- `xxxxx`, `YOUR_`, `<redacted>`

### Repo Secrets Scan

CLI tool for pre-commit/CI:

```bash
npm run security:secrets-scan

# Output (on detection):
# SECURITY ALERT: Found 2 potential secrets
# src/config.ts:42: openai_key
# tests/fixtures.ts:15: github_token
```

Config: `config/security/secrets-scan.allowlist.txt`

## 2. Policy-as-Code

### Configuration

Located at `config/proxy-mcp/policy.json`:

```json
{
  "version": "1.0.0",
  "safetyRules": [
    {
      "category": "deployment",
      "keywords": ["deploy", "production", "release"],
      "patterns": ["deploy\\s+to\\s+prod"],
      "action": "require_human",
      "riskLevel": "critical"
    },
    {
      "category": "automation_abuse",
      "keywords": ["captcha", "bypass"],
      "action": "deny",
      "riskLevel": "critical"
    }
  ],
  "dangerousPatterns": {
    "critical": ["deploy", "delete", "destroy"],
    "high": ["secret", "password", "token"],
    "medium": ["admin", "role", "permission"]
  },
  "defaults": {
    "defaultAction": "allow",
    "approvalTtlHours": 24,
    "requirePlanHash": true
  }
}
```

### Policy Evaluation

```typescript
import { evaluatePolicy, getDangerousPatterns } from './policy';

const result = evaluatePolicy('deploy to production');
// {
//   action: 'require_human',
//   matchedCategory: 'deployment',
//   riskLevel: 'critical',
//   reason: 'Safety rule [deployment]: matched keyword "deploy"'
// }
```

### Actions

| Action | Description |
|--------|-------------|
| `allow` | Proceed without approval |
| `require_human` | Pause for human approval |
| `deny` | Block operation completely |

### Overrides

Temporary overrides with expiry:

```json
{
  "overrides": [
    {
      "id": "override-001",
      "targetCategory": "deployment",
      "action": "allow",
      "reason": "Emergency hotfix",
      "createdBy": "admin",
      "approvedBy": "manager",
      "expiresAt": "2024-01-04T00:00:00Z"
    }
  ]
}
```

## 3. Approval Binding

### Plan Hash

Each execution plan gets a SHA-256 hash:

```typescript
import { createExecutionPlanWithHash, generatePlanHash } from './supervisor';

const plan = createExecutionPlanWithHash(steps, 'critical', true);
// plan.planHash = 'a1b2c3d4...' (64 hex chars)
```

### Validation

```typescript
import { validateApproval } from './supervisor';

const result = validateApproval(plan, approval);
// { valid: true } or { valid: false, reason: 'Plan hash mismatch' }
```

### Attack Prevention

1. **Plan Substitution**: Approval for Plan A cannot be used for Plan B
2. **Step Modification**: Changing steps after approval invalidates it
3. **TTL Expiry**: Approvals expire after configured hours (default: 24)

### Approval Flow

```
1. Plan Created → planHash generated
2. Approval Request → includes hash in GitHub issue
3. Human Approves → comment with optional hash
4. Validation → hash match + expiry check
5. Execute or Reject
```

## Integration Points

### Observability Service

```typescript
// src/proxy-mcp/observability/service.ts
export function recordEvent(options) {
  const redactedOptions = redactObject(options);
  // Store redacted data
}
```

### Memory Service

```typescript
// src/proxy-mcp/memory/service.ts
async add(content: string) {
  const redactedContent = redactSecrets(content).redacted;
  // Store redacted content
}
```

### Router Rules

```typescript
// src/proxy-mcp/router/rules.ts
function buildSafetyRules() {
  const policy = loadPolicy();
  return policy.safetyRules.map(/* ... */);
}
```

### Supervisor

```typescript
// src/proxy-mcp/supervisor/policy.ts
export function checkDangerousPatterns(input: string) {
  const patterns = getDangerousPatterns().all;
  // Check against patterns
}
```

## Files

### Security Module

| File | Purpose |
|------|---------|
| `src/proxy-mcp/security/patterns.ts` | Secret patterns + allowlist |
| `src/proxy-mcp/security/redact.ts` | Redaction functions |
| `src/proxy-mcp/security/index.ts` | Re-exports |

### Policy Module

| File | Purpose |
|------|---------|
| `src/proxy-mcp/policy/types.ts` | Policy type definitions |
| `src/proxy-mcp/policy/load.ts` | Policy loader + evaluator |
| `config/proxy-mcp/policy.json` | Policy configuration |

### Approval Module

| File | Purpose |
|------|---------|
| `src/proxy-mcp/supervisor/approve.ts` | Approval binding logic |
| `src/proxy-mcp/supervisor/types.ts` | Updated with planHash, expiresAt |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/security/secrets-scan.ts` | CLI secrets scanner |
| `config/security/secrets-scan.allowlist.txt` | Scan allowlist |

## Tests

```bash
# Run all P11 tests
npm test -- tests/unit/security-redact.test.ts \
            tests/unit/secrets-scan.test.ts \
            tests/unit/policy-config.test.ts \
            tests/unit/approval-binding.test.ts
```

Total: 122 tests

## References

- Issue #154: [P11] Security & Governance Hardening
- PR #??? (to be created)
