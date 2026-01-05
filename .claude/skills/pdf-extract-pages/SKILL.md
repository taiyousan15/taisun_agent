---
name: pdf-extract-pages
description: PDFから指定ページ範囲のテキストを抽出。大出力はメモリに保存し、要約+参照IDのみ返却。
triggers:
  fileExts: [pdf]
  mimeTypes: [application/pdf]
  urlSuffixes: [.pdf]
---

# PDF Extract Pages

PDFから指定ページ範囲のテキストを抽出するスキル。大きな出力はメモリに保存される。

## Instructions

1. PDFファイルパスまたはURLを受け取る
2. 指定されたページ範囲のテキストを抽出
3. 大きな出力（10,000文字超）はメモリに保存
4. 要約と参照IDを返却

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| source | string | Yes | PDFファイルパスまたはURL |
| pages | string | Yes | ページ範囲（例: "1-5", "1,3,5", "1-10,15"） |
| includeImages | boolean | No | 画像を抽出するか（デフォルト: false） |
| namespace | string | No | メモリ名前空間（"short-term" or "long-term"） |

## Output

- `summary`: 抽出内容の要約（最初の500文字程度）
- `referenceId`: メモリに保存された全文への参照ID
- `pageCount`: 抽出したページ数
- `contentSize`: 抽出した文字数

## Usage Examples

```
# 最初の5ページを抽出
skill.run("pdf.extract_pages", {
  source: "/path/to/document.pdf",
  pages: "1-5"
})

# 特定のページを抽出
skill.run("pdf.extract_pages", {
  source: "https://example.com/report.pdf",
  pages: "1,5,10-15"
})

# 画像付きで抽出
skill.run("pdf.extract_pages", {
  source: "/path/to/document.pdf",
  pages: "1-3",
  includeImages: true
})
```

## Recommended Workflow

1. まず `pdf.inspect` でページ数を確認
2. 20ページ以下なら一括抽出可能
3. 20ページ超の場合は10-20ページ単位で分割抽出
4. 抽出結果は `memory.search` で参照ID検索可能

## Notes

- 全文は会話に直接返さない（コンテキスト保護）
- 要約+参照IDのみ返却される
- 長期保存が必要な場合は `namespace: "long-term"` を指定
