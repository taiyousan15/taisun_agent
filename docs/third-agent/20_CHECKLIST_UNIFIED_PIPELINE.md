# Checklist: Unified Pipeline (web_skillize)

`pipeline.web_skillize` の使用チェックリスト。

## Pre-requisites

- [ ] mode='tabs'の場合: Chromeが `--remote-debugging-port=9222` で起動済み
- [ ] mode='refId'の場合: 有効なURL束のrefIdを準備

## Mode Selection

### mode='tabs' を使用する場合

```typescript
const result = await skillRunAsync('pipeline.web_skillize', {
  mode: 'tabs',
  includeDomains: ['docs.example.com'],
});
```

- [ ] Chromeが起動済み
- [ ] 対象タブが開かれている
- [ ] `mode: 'tabs'` を指定
- [ ] `inputRefId` は指定しない

### mode='refId' を使用する場合

```typescript
const result = await skillRunAsync('pipeline.web_skillize', {
  mode: 'refId',
  inputRefId: 'existing-bundle-ref-123',
});
```

- [ ] 有効なURL束のrefIdがある
- [ ] `mode: 'refId'` を指定
- [ ] `inputRefId` を必ず指定

## Standard Workflow

### Step 1: Dry-run実行

```typescript
const result = await skillRunAsync('pipeline.web_skillize', {
  mode: 'tabs', // or 'refId'
  // inputRefId: 'ref-123', // mode='refId'の場合
});
console.log(result.data?.summary);
```

- [ ] `success: true` を確認
- [ ] summaryで処理URL数を確認
- [ ] `mode=` が正しく表示されていることを確認

### Step 2: 結果確認

```typescript
const runRecord = await memoryGetContent(result.referenceId);
console.log(runRecord);
```

- [ ] `stages.tabs` / `stages.normalize` / `stages.skillize` を確認
- [ ] 成功/失敗数を確認

### Step 3: 書き込み実行（Supervisor承認）

```typescript
const writeResult = await skillRunAsync('pipeline.web_skillize', {
  mode: 'refId',
  inputRefId: result.referenceId,
  confirmWrite: true,
});
```

- [ ] Supervisor承認を取得
- [ ] `.claude/skills/` への書き込みを確認

## Validation Rules

| 設定 | Valid | Error |
|------|-------|-------|
| mode='tabs', inputRefId=null | ✓ | - |
| mode='tabs', inputRefId='ref' | ✗ | "inputRefId should not be provided" |
| mode='refId', inputRefId=null | ✗ | "inputRefId is required" |
| mode='refId', inputRefId='ref' | ✓ | - |
| mode=undefined | ✗ | "mode is required" |

## Troubleshooting

### mode指定エラー
```
Error: mode is required: "tabs" (CDP) or "refId" (existing bundle)
```
- [ ] `mode` パラメータを必ず指定

### inputRefId不整合
```
Error: inputRefId is required when mode="refId"
```
- [ ] mode='refId'の場合は必ず `inputRefId` を指定

```
Error: inputRefId should not be provided when mode="tabs"
```
- [ ] mode='tabs'の場合は `inputRefId` を指定しない

### CDP接続エラー
```
Error: CDP connection failed: ECONNREFUSED
```
- [ ] Chromeが起動していることを確認
- [ ] `npm run chrome:debug:start` を実行

## Quick Reference

| Parameter | Type | Required |
|-----------|------|----------|
| mode | 'tabs' \| 'refId' | ✓ Always |
| inputRefId | string | ✓ When mode='refId' |
| confirmWrite | boolean | Optional (default: false) |

## Migration from web_skillize_from_tabs

```typescript
// 旧: CDP収集
webSkillizeFromTabs()
// 新: 明示的モード
webSkillize({ mode: 'tabs' })

// 旧: 既存URL束
webSkillizeFromTabs({ inputRefId: 'ref' })
// 新: 明示的モード
webSkillize({ mode: 'refId', inputRefId: 'ref' })
```
