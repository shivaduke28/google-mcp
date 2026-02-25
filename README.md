# google-mcp

Google API の MCP (Model Context Protocol) サーバー群をまとめた pnpm workspace モノレポ。

## Packages

| パッケージ | 説明 |
|---|---|
| [`packages/auth`](packages/auth/) | 共通 OAuth 認証（PKCE 対応） |
| [`packages/calendar`](packages/calendar/) | Google Calendar MCP サーバー |
| [`packages/gmail`](packages/gmail/) | Gmail MCP サーバー |
| [`packages/sheets`](packages/sheets/) | Google Sheets MCP サーバー |
| [`packages/docs`](packages/docs/) | Google Docs MCP サーバー |

## Setup

### 1. GCP プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 使いたい API を有効化（Calendar / Gmail / Sheets / Drive）
3. OAuth 同意画面を設定
4. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
5. 認証情報の JSON ファイルをダウンロード → `credentials.json` として保存

### 2. MCP 設定

`npx` で npm から直接実行できます。

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@shivaduke28/google-calendar-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json",
        "GOOGLE_MCP_CONFIG": "/path/to/config.json"
      }
    },
    "gmail": {
      "command": "npx",
      "args": ["-y", "@shivaduke28/gmail-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json"
      }
    },
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "@shivaduke28/google-sheets-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json",
        "GOOGLE_MCP_CONFIG": "/path/to/config.json"
      }
    },
    "google-docs": {
      "command": "npx",
      "args": ["-y", "@shivaduke28/google-docs-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json",
        "GOOGLE_MCP_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### 3. 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `GOOGLE_OAUTH_CREDENTIALS` | Yes | OAuth クライアント認証情報の JSON ファイルパス |
| `GOOGLE_MCP_CONFIG` | No | 共通設定ファイルパス（calendar / sheets / docs で使用） |
| `GOOGLE_OAUTH_TOKENS` | No | トークン保存先（デフォルト: `~/.config/<package>-mcp/tokens.json`） |

パスには `~` が使えます（`$HOME` に展開されます）。

### 4. 認証

初回起動時にブラウザが開き、Google アカウントでの認証を求められます。認証後、トークンは `~/.config/<package>-mcp/tokens.json` に自動保存されます。PKCE (Proof Key for Code Exchange) に対応。

## Config

`GOOGLE_MCP_CONFIG` で指定する JSON ファイルに、各パッケージの設定をまとめて記述できます。

```json
{
  "calendar": {
    "internalDomain": "example.com",
    "permissions": {
      "read": { "self_only": "allow", "internal": "allow", "external": "allow" },
      "create": { "self_only": "allow", "internal": "deny", "external": "deny" },
      "update": { "self_only": "allow", "internal": "deny", "external": "deny" },
      "delete": { "self_only": "deny", "internal": "deny", "external": "deny" }
    }
  },
  "sheets": {
    "allowedSpreadsheets": [
      { "id": "spreadsheet-id", "name": "表示名", "access": "readonly" }
    ]
  },
  "docs": {
    "allowedDocuments": [
      { "id": "document-id", "name": "表示名" }
    ],
    "allowedFolders": [
      { "id": "folder-id", "name": "表示名" }
    ]
  }
}
```

各パッケージは自分のキー（`calendar`, `sheets`, `docs`）のみを読み込み、他のキーは無視します。詳細は各パッケージの README を参照してください。

## Development

### ビルド・テスト

```bash
pnpm install          # 依存解決
pnpm build            # 全パッケージビルド
pnpm typecheck        # 全パッケージ型チェック
pnpm -r test          # 全パッケージテスト
```

### ローカルビルドで MCP サーバーを起動

ビルド済みの `dist/index.js` を直接指定して起動することもできます。

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "node",
      "args": ["/path/to/google-mcp/packages/calendar/dist/index.js"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json",
        "GOOGLE_MCP_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

## License

ISC
