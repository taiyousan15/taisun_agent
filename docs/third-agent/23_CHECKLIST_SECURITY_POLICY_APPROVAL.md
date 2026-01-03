# Checklist: Security, Policy & Approval

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] npm or pnpm installed
- [ ] Git repository initialized

## Secrets Redaction Setup

### 1. Verify Patterns

- [ ] Check `src/proxy-mcp/security/patterns.ts`
- [ ] Verify all required provider patterns exist:
  - [ ] GitHub tokens (PAT, fine-grained)
  - [ ] AWS keys (access, secret)
  - [ ] Slack tokens
  - [ ] OpenAI keys
  - [ ] Stripe keys
  - [ ] Notion tokens
  - [ ] Google API keys

### 2. Test Redaction

```bash
npm test -- tests/unit/security-redact.test.ts
```

- [ ] All 35 tests pass

### 3. Integration Points

- [ ] Observability service uses `redactObject()`:
  ```typescript
  // src/proxy-mcp/observability/service.ts
  const redactedOptions = redactObject(options);
  ```

- [ ] Memory service uses `redactSecrets()`:
  ```typescript
  // src/proxy-mcp/memory/service.ts
  const redactedContent = redactSecrets(content).redacted;
  ```

## Repo Secrets Scan Setup

### 1. Configure Allowlist

Create/edit `config/security/secrets-scan.allowlist.txt`:

```
# Allowlist patterns
/tests/fixtures/
/docs/examples/
.example.ts
```

### 2. Add npm Script

```json
{
  "scripts": {
    "security:secrets-scan": "tsx scripts/security/secrets-scan.ts"
  }
}
```

### 3. Test Scanner

```bash
npm run security:secrets-scan
```

- [ ] Scanner completes without false positives
- [ ] No real secrets detected

### 4. Pre-commit Hook (Optional)

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
npm run security:secrets-scan
```

### 5. CI Integration (Optional)

Add to `.github/workflows/ci.yml`:

```yaml
- name: Secrets Scan
  run: npm run security:secrets-scan
```

## Policy-as-Code Setup

### 1. Create Policy Config

Create `config/proxy-mcp/policy.json`:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2024-01-03T00:00:00.000Z",
  "safetyRules": [
    {
      "category": "deployment",
      "keywords": ["deploy", "production"],
      "patterns": ["deploy\\s+to\\s+prod"],
      "action": "require_human",
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

### 2. Verify Policy Loading

```bash
npm test -- tests/unit/policy-config.test.ts
```

- [ ] All 36 tests pass

### 3. Safety Categories

Verify these categories are configured:

| Category | Action | Risk Level |
|----------|--------|------------|
| deployment | require_human | critical |
| destructive | require_human | critical |
| secrets | require_human | high |
| billing | require_human | high |
| access_control | require_human | medium |
| automation_abuse | deny | critical |

## Approval Binding Setup

### 1. Verify Types Updated

Check `src/proxy-mcp/supervisor/types.ts`:

```typescript
export interface ExecutionPlan {
  // ...
  planHash?: string;  // Added
}

export interface ApprovalStatus {
  // ...
  approvedPlanHash?: string;  // Added
  expiresAt?: string;         // Added
}
```

### 2. Test Approval Binding

```bash
npm test -- tests/unit/approval-binding.test.ts
```

- [ ] All 28 tests pass

### 3. Verify Attack Prevention

- [ ] Plan substitution attack prevented
- [ ] Step modification attack prevented
- [ ] Expired approvals rejected

## Full Test Suite

### Run All P11 Tests

```bash
npm test -- tests/unit/security-redact.test.ts \
            tests/unit/secrets-scan.test.ts \
            tests/unit/policy-config.test.ts \
            tests/unit/approval-binding.test.ts
```

- [ ] 122 total tests pass

### Run Full Test Suite

```bash
npm test
```

- [ ] All tests pass
- [ ] No regressions

## Verification Checklist

### Secrets Guard

- [ ] Secrets are redacted in observability logs
- [ ] Secrets are redacted in memory storage
- [ ] Repo scanner detects real secrets
- [ ] Repo scanner ignores allowlisted paths

### Policy-as-Code

- [ ] Policy loads from config file
- [ ] Default policy used if file missing
- [ ] All safety categories working
- [ ] Deny action blocks operations
- [ ] require_human pauses for approval

### Approval Binding

- [ ] Plans get SHA-256 hash
- [ ] Approval includes plan hash
- [ ] Hash mismatch rejects execution
- [ ] Expired approvals rejected
- [ ] TTL configurable in policy

## Troubleshooting

### Secrets Not Redacted

1. Check pattern matches the secret format
2. Verify allowlist doesn't contain false match
3. Check integration point calls redact functions

### Policy Not Loading

1. Verify `config/proxy-mcp/policy.json` exists
2. Check JSON syntax is valid
3. Verify required fields present

### Approval Validation Failing

1. Check plan hash is generated
2. Verify approval has plan hash
3. Check expiry time is in future

## File Reference

| File | Purpose |
|------|---------|
| `src/proxy-mcp/security/patterns.ts` | Secret patterns |
| `src/proxy-mcp/security/redact.ts` | Redaction logic |
| `config/proxy-mcp/policy.json` | Policy config |
| `src/proxy-mcp/policy/load.ts` | Policy loader |
| `src/proxy-mcp/supervisor/approve.ts` | Approval binding |
| `scripts/security/secrets-scan.ts` | Repo scanner |

## Related Documentation

- [37_SECURITY_POLICY_APPROVAL.md](./37_SECURITY_POLICY_APPROVAL.md) - Architecture overview
