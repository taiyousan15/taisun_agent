# Unified Pipeline: web_skillize - P8

単一エントリーポイントで `mode` パラメータによる入力ソース選択を提供する統一パイプライン。

## Overview

`pipeline.web_skillize` は以下の2つのモードをサポート:

1. **mode='tabs'**: Chrome CDP経由でタブURLを収集
2. **mode='refId'**: メモリ内の既存URL束を使用

内部的には `pipeline.web_skillize_from_tabs` (P7.3) に委譲し、明示的なAPIを提供。

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    pipeline.web_skillize                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  mode='tabs'              mode='refId'                                  │
│  ┌──────────────────┐     ┌──────────────────┐                         │
│  │  Chrome Tabs     │     │  Existing URL    │                         │
│  │  (CDP)           │     │  Bundle          │                         │
│  └────────┬─────────┘     └────────┬─────────┘                         │
│           │                        │                                    │
│           └────────────┬───────────┘                                    │
│                        ↓                                                │
│         ┌──────────────────────────────┐                               │
│         │  pipeline.web_skillize_from_tabs                             │
│         │  (internal delegation)       │                               │
│         └──────────────────────────────┘                               │
│                        │                                                │
│                        ↓                                                │
│         ┌──────────────────────────────┐                               │
│         │  normalize -> skillize       │                               │
│         └──────────────────────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## API Reference

### pipeline.web_skillize

```typescript
webSkillize(options: UnifiedPipelineConfig): Promise<WebSkillResult>
```

**Required Options:**
| Parameter | Type | Description |
|-----------|------|-------------|
| mode | 'tabs' \| 'refId' | 入力モード（必須） |
| inputRefId | string | mode='refId'の時必須 |

**Optional Options:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| includeDomains | string[] \| null | null | 含めるドメイン |
| excludeDomains | string[] \| null | null | 除外するドメイン |
| excludeUrlPatterns | string[] \| null | null | 除外するURLパターン |
| maxUrls | number | 200 | 正規化の最大URL数 |
| perDomainLimit | number | 50 | ドメインごとの上限 |
| stripTracking | boolean | true | UTM等トラッキング除去 |
| maxFetch | number | 20 | Skillize対象の最大URL数 |
| rateLimitMs | number | 1000 | URL間の遅延（ms） |
| confirmWrite | boolean | false | ディスク書き込み |
| namespace | MemoryNamespace | 'long-term' | 出力の保存先 |

**出力例:**
```json
{
  "success": true,
  "refId": "pipeline-run-abc123",
  "summary": "Pipeline: web_skillize (mode=tabs) (DRY-RUN)\nDuration: 45s\n\nStages:\n  1. Tabs: 25 collected\n  2. Normalize: 25 -> 20 URLs\n  3. Skillize: 18/20 success"
}
```

## Usage Examples

### Mode: tabs (CDP)

```typescript
// Chromeでタブを開く
// パイプライン実行
const result = await webSkillize({
  mode: 'tabs',
  includeDomains: ['docs.example.com'],
});

console.log(result.summary);
```

### Mode: refId (既存URL束)

```typescript
// 既存のURL束を使用
const result = await webSkillize({
  mode: 'refId',
  inputRefId: 'existing-bundle-ref-123',
});

console.log(result.summary);
```

### With Write Mode

```typescript
// dry-run後、結果を確認してから書き込み
const dryRun = await webSkillize({ mode: 'tabs' });
console.log(dryRun.summary);

// 承認後、書き込み実行
const writeResult = await webSkillize({
  mode: 'refId',
  inputRefId: dryRun.refId,
  confirmWrite: true,
});
```

## Validation Rules

| Mode | inputRefId | Valid |
|------|------------|-------|
| tabs | null/undefined | ✓ |
| tabs | 提供 | ✗ エラー |
| refId | null/undefined | ✗ エラー |
| refId | 提供 | ✓ |

## Error Handling

### Missing mode
```json
{
  "success": false,
  "error": "mode is required: \"tabs\" (CDP) or \"refId\" (existing bundle)"
}
```

### mode=refId without inputRefId
```json
{
  "success": false,
  "error": "inputRefId is required when mode=\"refId\""
}
```

### mode=tabs with inputRefId
```json
{
  "success": false,
  "error": "inputRefId should not be provided when mode=\"tabs\". Use mode=\"refId\" instead."
}
```

## Migration from web_skillize_from_tabs

| 旧API | 新API |
|-------|-------|
| `webSkillizeFromTabs()` | `webSkillize({ mode: 'tabs' })` |
| `webSkillizeFromTabs({ inputRefId: 'ref' })` | `webSkillize({ mode: 'refId', inputRefId: 'ref' })` |

**後方互換性**: `webSkillizeFromTabs` は引き続き使用可能。

## Files

| File | Description |
|------|-------------|
| `src/proxy-mcp/browser/pipeline-unified-skillize.ts` | 統一パイプライン実装 |
| `src/proxy-mcp/browser/skills.ts` | スキル関数ラッパー |
| `src/proxy-mcp/tools/skill.ts` | skill_run統合 |
| `tests/unit/pipeline-unified-skillize.test.ts` | ユニットテスト |

## Related

- [33_ONE_COMMAND_PIPELINE.md](./33_ONE_COMMAND_PIPELINE.md) - P7.3実装詳細
- [32_URL_BUNDLE_PIPELINE.md](./32_URL_BUNDLE_PIPELINE.md) - URL束パイプライン
- [24_SKILLIZE.md](./24_SKILLIZE.md) - Skillize基本機能
