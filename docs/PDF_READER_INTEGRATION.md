# PDF Reader MCP Integration

大きいPDFを効率的に読み取るための専用MCP統合。PDFが渡された時だけ遅延ロードで呼び出される。

## 概要

- **MCP**: [@sylphx/pdf-reader-mcp](https://github.com/sylphxai/pdf-reader-mcp)
- **Node.js要件**: >= 22.0.0
- **ロード方式**: 遅延ロード（deferred loading）
- **露出**: Claude Codeには露出しない（proxy-only）

## アーキテクチャ

```
ユーザー入力（PDFパス/URL含む）
    ↓
Router/MCPSearch（トリガー評価）
    ↓ PDFが検出された場合のみ
pdf-reader-mcp をロード
    ↓
pdf.inspect または pdf.extract_pages を実行
    ↓
大きな出力はMemoryに保存
    ↓
要約 + 参照ID を返却
```

## 設定ファイル

### 階層構造

| ファイル | 役割 |
|----------|------|
| `.mcp.json` | 有効なMCPサーバー（taisun-proxyのみ、変更なし） |
| `.mcp.full.json` | MCPカタログ（pdf-reader追加、disabled） |
| `config/proxy-mcp/internal-mcps.json` | Internal MCP定義（pdf-reader追加、triggers付き） |

### トリガー設定

```json
{
  "name": "pdf-reader",
  "triggers": {
    "fileExts": ["pdf", "PDF"],
    "mimeTypes": ["application/pdf"],
    "urlSuffixes": [".pdf", ".PDF"],
    "deferredOnly": true
  }
}
```

## スキル

### pdf.inspect

PDFの概要を軽量に取得（全文抽出なし）。

```typescript
// 使用例
skill.run("pdf.inspect", { source: "/path/to/document.pdf" })

// 出力
{
  numPages: 50,
  metadata: { title: "Report", author: "John" },
  recommendedStrategy: "Extract in 3 batches of 20 pages each"
}
```

### pdf.extract_pages

指定ページ範囲のテキストを抽出。大きな出力はMemoryに保存。

```typescript
// 使用例
skill.run("pdf.extract_pages", {
  source: "/path/to/document.pdf",
  pages: "1-10"
})

// 出力
{
  referenceId: "mem_abc123",
  summary: "First 500 chars of extracted text...",
  pageCount: 10,
  contentSize: 25000,
  storedInMemory: true
}
```

## 大PDF処理戦略

1. **まず inspect**: `pdf.inspect` でページ数を確認
2. **閾値判定**:
   - 20ページ以下 → 一括抽出可能
   - 20ページ超 → 分割抽出を推奨
3. **分割抽出**: 10-20ページ単位で段階的に抽出
4. **優先順位**:
   - 先頭数ページ（概要/目次）を最初に
   - ユーザーの質問に応じて関連ページを追加

## 出力の外部化

大きな出力（10,000文字超）は自動的にMemoryに保存される。

```typescript
// 返却される情報（会話に直接流さない）
{
  success: true,
  referenceId: "mem_abc123",  // Memory参照ID
  data: {
    summary: "...",           // 要約（最初の500文字）
    pageCount: 10,
    contentSize: 25000,
    storedInMemory: true,
    message: "Use memory.search with refId to retrieve"
  }
}

// 全文を取得する場合
memory.search({ query: "mem_abc123" })
```

## 自動化スクリプト

新しいInternal MCPを追加する場合：

```bash
# インタラクティブモード
npx ts-node scripts/add-internal-mcp.ts --interactive

# 設定ファイルから
npx ts-node scripts/add-internal-mcp.ts --config mcp-config.json
```

設定ファイル例:
```json
{
  "name": "pdf-reader",
  "npmPackage": "@sylphx/pdf-reader-mcp",
  "description": "PDF reading and text extraction",
  "category": "document",
  "tags": ["pdf", "document", "extract"],
  "tools": ["read_pdf"],
  "triggers": {
    "fileExts": ["pdf", "PDF"],
    "mimeTypes": ["application/pdf"],
    "urlSuffixes": [".pdf"],
    "deferredOnly": true
  }
}
```

## トラブルシューティング

### PDFが認識されない

1. 入力にPDFパスまたはURLが含まれているか確認
2. 拡張子が `.pdf` または `.PDF` か確認
3. URLの場合、クエリパラメータを除いた部分が `.pdf` で終わっているか確認

### Node.jsバージョンエラー

pdf-reader-mcpはNode.js 22.0.0以上が必要：

```bash
node --version  # >= 22.0.0 を確認
```

### 大きすぎるPDF

100ページ超のPDFは段階的に抽出：

```typescript
// 1. 概要を取得
const info = await skill.run("pdf.inspect", { source: "large.pdf" });

// 2. 先頭部分を取得
await skill.run("pdf.extract_pages", { source: "large.pdf", pages: "1-5" });

// 3. 必要に応じて追加
await skill.run("pdf.extract_pages", { source: "large.pdf", pages: "20-30" });
```
