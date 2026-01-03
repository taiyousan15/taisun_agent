# MCP Catalog

This directory contains MCP server candidates discovered from external sources (awesome lists, etc.).

## Purpose

- **Catalog only**: This is a candidate database, NOT automatic enablement
- **Safe by default**: All entries are disabled stubs until explicitly enabled via Phase 6 rollout
- **Source tracking**: Each entry tracks where it was discovered (source metadata)

## Directory Structure

```
catalog/mcp/
├── README.md                          # This file
├── sources.json                       # List of external sources
├── awesome_mcp_servers.sample.md      # Sample fixture for testing
├── catalog.json                       # Generated catalog (candidates)
└── overrides.json                     # Manual score adjustments
```

## Workflow

```
1. Import: awesome list → catalog.json (candidates)
2. Score: Apply scoring rules + overrides
3. Generate: Create disabled stubs in internal-mcps.local.example.generated.json
4. Enable: Phase 6 rollout (canary → rollback → observability)
```

## Important

- **NEVER** auto-enable from catalog
- **ALWAYS** use Phase 6 rollout for production enablement
- **NEVER** commit real API keys/tokens
- See docs/third-agent/35_MCP_CATALOG_GOVERNANCE.md for details

## Files

| File | Description |
|------|-------------|
| `sources.json` | External source definitions |
| `catalog.json` | Generated catalog of candidates |
| `overrides.json` | Manual score adjustments |
| `*.sample.md` | Test fixtures |
