# google-mcp

Google API の MCP サーバー群の pnpm workspace モノレポ。

## プロジェクト構成

```
packages/
  auth/       共通 OAuth 認証パッケージ（内部パッケージ、npm公開なし）
  calendar/   Google Calendar MCP サーバー
  gmail/      Gmail MCP サーバー
  sheets/     Google Sheets MCP サーバー
```

## ビルド・テスト

```bash
pnpm build        # 全パッケージビルド（pnpm -r build）
pnpm typecheck    # 全パッケージ型チェック（pnpm -r typecheck）
pnpm -r test      # 全パッケージテスト
```

個別パッケージ:
```bash
pnpm --filter @shivaduke28/google-calendar-mcp build
pnpm --filter @shivaduke28/google-calendar-mcp test
```

## アーキテクチャ

- **auth パッケージ**: OAuth2 認証 + PKCE を提供。各パッケージが `authorize(credentialsPath, tokensPath, scopes)` で利用
- **config**: `GOOGLE_MCP_CONFIG` 環境変数で1つの JSON ファイルを共有。`loadConfig<T>(configPath, key)` で各パッケージが自分のキーだけ読む
- **パーミッション**: calendar はドメインベース（self_only/internal/external）、sheets は allowlist ベース
- **lazy auth**: MCP サーバー起動時ではなく、最初のツール呼び出し時に認証する
- **TOON**: レスポンスは TOON 形式（`@toon-format/toon`）で返す

## パッケージ間の依存

- calendar, gmail, sheets → auth（`@shivaduke28/google-mcp-auth` を `workspace:*` で参照）
- auth は `declaration: true` で型定義を出力

## テスト

- Node.js 組み込みテストランナー（`node:test` + `node:assert`）を使用
- `tsx --test test/*.test.ts` で実行
- calendar: permissions のユニットテスト（25テスト）
- gmail: ヘッダー抽出・本文デコード・メッセージ構築のユニットテスト（15テスト）
