# @shivaduke28/google-apps-script-mcp

Google Apps Script API の MCP (Model Context Protocol) サーバー。

allowlist 方式のパーミッション制御により、アクセス可能なプロジェクトと読み取り・書き込み・実行権限を制御できます。

## Tools

| ツール | 説明 |
|---|---|
| `list-projects` | allowlist に登録された Apps Script プロジェクト一覧を返す |
| `get-project` | プロジェクトのメタデータを取得する |
| `get-content` | プロジェクトのソースファイル一覧と内容を取得する |
| `update-content` | プロジェクトのソースファイルを更新する（readwrite 以上） |
| `run-function` | プロジェクトの関数を実行する（execute のみ） |

レスポンスは [TOON](https://github.com/toon-format/toon) 形式で返されます。

## Setup

### 1. GCP プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Apps Script API を有効化
3. OAuth 同意画面を設定
4. OAuth 2.0 クライアント ID を作成（デスクトップアプリ）
5. 認証情報の JSON ファイルをダウンロード → `credentials.json` として保存

### 2. 使い方

#### npx（推奨）

```json
{
  "mcpServers": {
    "google-apps-script": {
      "command": "npx",
      "args": ["-y", "@shivaduke28/google-apps-script-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json",
        "GOOGLE_MCP_CONFIG": "/path/to/google-mcp-config.json"
      }
    }
  }
}
```

#### ソースから実行

```bash
pnpm install
pnpm -r build
```

```json
{
  "mcpServers": {
    "google-apps-script": {
      "command": "node",
      "args": ["/path/to/google-mcp/packages/apps-script/dist/index.js"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/credentials.json"
      }
    }
  }
}
```

### 3. 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `GOOGLE_OAUTH_CREDENTIALS` | Yes | OAuth クライアント認証情報の JSON ファイルパス |
| `GOOGLE_MCP_CONFIG` | No | 共通設定ファイルパス。`apps-script` キーから設定を読み込む |

### 4. 認証

初回起動時にブラウザが開き、Google アカウントでの認証を求められます。認証後、トークンは `~/.config/google-apps-script-mcp/tokens.json` に自動保存され、以降はブラウザ認証なしで起動できます。

PKCE (Proof Key for Code Exchange) に対応しています。

## Config

`GOOGLE_MCP_CONFIG` で指定した JSON ファイルの `apps-script` キーから設定を読み込みます。未指定の場合は全プロジェクトにアクセス可能です。

```json
{
  "apps-script": {
    "allowedProjects": [
      {
        "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
        "name": "データ集計スクリプト",
        "access": "readonly"
      },
      {
        "id": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
        "name": "定期レポート生成",
        "access": "readwrite"
      },
      {
        "id": "1ZzYyXxWwVvUuTtSsRrQqPpOoNn",
        "name": "Slack通知Bot",
        "access": "execute",
        "extraScopes": [
          "https://www.googleapis.com/auth/spreadsheets.readonly",
          "https://www.googleapis.com/auth/gmail.send"
        ]
      }
    ]
  }
}
```

| フィールド | 説明 |
|---|---|
| `id` | Apps Script プロジェクト ID |
| `name` | 人間が読める名前（表示用） |
| `access` | `readonly`（読み取りのみ）、`readwrite`（読み書き可）、`execute`（読み書き＋実行可） |
| `extraScopes` | `execute` 時に必要な追加 OAuth スコープ（対象スクリプトが使用する Google API のスコープ） |

- allowlist が未設定（`GOOGLE_MCP_CONFIG` 未指定 or `apps-script` キーなし）の場合は全プロジェクトにアクセス可能
- allowlist が設定されている場合、リストにないプロジェクトへのアクセスは拒否されます
- `readonly` のプロジェクトに対する `update-content` は拒否されます
- `readonly` / `readwrite` のプロジェクトに対する `run-function` は拒否されます
- `run-function` を使用するには、対象スクリプトが API 実行用にデプロイされている必要があります

## Development

```bash
pnpm install
pnpm --filter @shivaduke28/google-apps-script-mcp dev          # tsx で開発実行
pnpm --filter @shivaduke28/google-apps-script-mcp build        # tsc でビルド
pnpm --filter @shivaduke28/google-apps-script-mcp test         # テスト
pnpm --filter @shivaduke28/google-apps-script-mcp typecheck    # 型チェック
```

## License

ISC
