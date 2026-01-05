---
name: pdf-inspect
description: PDFファイルの概要を取得（ページ数、メタデータ、推奨抽出戦略）。大きいPDFを読む前に必ず実行。
triggers:
  fileExts: [pdf]
  mimeTypes: [application/pdf]
  urlSuffixes: [.pdf]
---

# PDF Inspect

PDFファイルの概要情報を軽量に取得するスキル。全文抽出前の調査に使用。

## Instructions

1. PDFファイルパスまたはURLを受け取る
2. pdf-reader-mcpを使用してメタデータのみ取得
3. ページ数に応じた推奨抽出戦略を提示

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| source | string | Yes | PDFファイルパスまたはURL |

## Output

- `numPages`: 総ページ数
- `metadata`: タイトル、著者、作成日等
- `recommendedStrategy`: 推奨される抽出方法

## Usage Examples

```
# ローカルファイル
skill.run("pdf.inspect", { source: "/path/to/document.pdf" })

# URL
skill.run("pdf.inspect", { source: "https://example.com/report.pdf" })
```

## Notes

- 全文抽出は行わない（軽量）
- 大きいPDFの場合は分割抽出を推奨
- pdf.extract_pagesと組み合わせて使用
