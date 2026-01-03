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
├── catalog.json                       # Generated catalog (candidates)
├── overrides.json                     # Manual score adjustments
└── fixtures/                          # Test fixtures (CI uses these)
    └── awesome_mcp_servers.sample.md  # Sample awesome-list markdown
```

## Workflow

```
1. Import: awesome list → catalog.json (candidates)
2. Score: Apply scoring rules + overrides
3. Generate: Create disabled stubs in internal-mcps.local.example.generated.json
4. Enable: Phase 6 rollout (canary → rollback → observability)
```

## CLI Commands

```bash
# Import from fixture → catalog.json
npm run catalog:import

# Score entries + apply overrides
npm run catalog:score

# Generate disabled stubs
npm run catalog:stubs

# Generate only top 20 candidates
npm run catalog:stubs -- --top 20
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
