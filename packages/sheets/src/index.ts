#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { encode } from "@toon-format/toon";
import { authorize } from "@shivaduke28/google-mcp-auth";
import { sheets as googleSheets } from "@googleapis/sheets";
import { loadPermissionConfig, checkAccess } from "./permissions.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
];

const credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
const configPath = process.env.GOOGLE_MCP_CONFIG;

if (!credentialsPath) {
  console.error("GOOGLE_OAUTH_CREDENTIALS 環境変数を設定してください");
  process.exit(1);
}
if (!existsSync(credentialsPath)) {
  console.error(`credentials.json が見つかりません: ${credentialsPath}`);
  process.exit(1);
}

const resolvedCredentialsPath: string = credentialsPath;
const resolvedTokensPath: string = process.env.GOOGLE_OAUTH_TOKENS ?? join(homedir(), ".config", "google-sheets-mcp", "tokens.json");

// パーミッション設定
const permConfig = await loadPermissionConfig(configPath);

// lazy auth: ツール呼び出し時に初めて認証する
let sheetsClient: ReturnType<typeof googleSheets> | null = null;

async function getSheets() {
  if (!sheetsClient) {
    const auth = await authorize(resolvedCredentialsPath, resolvedTokensPath, SCOPES);
    sheetsClient = googleSheets({ version: "v4", auth });
  }
  return sheetsClient;
}

const server = new McpServer({
  name: "google-sheets-mcp",
  version: "0.1.0",
});

// 1. list-spreadsheets
server.registerTool(
  "list-spreadsheets",
  {
    description: "allowlistに登録されたスプレッドシート一覧を返す。レスポンスはTOON形式で返す。",
    inputSchema: {},
  },
  async () => {
    if (!permConfig) {
      return {
        content: [{
          type: "text",
          text: "allowlistが設定されていません。GOOGLE_MCP_CONFIG 環境変数で設定ファイルを指定してください。",
        }],
      };
    }

    const rows = permConfig.allowedSpreadsheets.map((entry) => ({
      id: entry.id,
      name: entry.name,
      access: entry.access,
    }));

    return {
      content: [{
        type: "text",
        text: rows.length > 0
          ? encode({ spreadsheets: rows })
          : "allowlistにスプレッドシートが登録されていません。",
      }],
    };
  }
);

// 2. get-spreadsheet
server.registerTool(
  "get-spreadsheet",
  {
    description: "スプレッドシートのメタデータ（シート名一覧など）を取得する。レスポンスはTOON形式で返す。",
    inputSchema: {
      spreadsheetId: z.string().describe("スプレッドシートID"),
    },
  },
  async ({ spreadsheetId }) => {
    const { allowed, reason } = checkAccess(permConfig, spreadsheetId, false);
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const sheets = await getSheets();
    const res = await sheets.spreadsheets.get({ spreadsheetId });

    const sheetList = (res.data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? "",
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    }));

    return {
      content: [{
        type: "text",
        text: encode({
          title: res.data.properties?.title ?? "",
          spreadsheetId: res.data.spreadsheetId ?? "",
          sheets: sheetList,
        }),
      }],
    };
  }
);

// 3. get-values
server.registerTool(
  "get-values",
  {
    description: "指定範囲のセル値を取得する（A1表記: Sheet1!A1:D10）。レスポンスはTOON形式で返す。",
    inputSchema: {
      spreadsheetId: z.string().describe("スプレッドシートID"),
      range: z.string().describe("取得範囲（A1表記。例: Sheet1!A1:D10）"),
    },
  },
  async ({ spreadsheetId, range }) => {
    const { allowed, reason } = checkAccess(permConfig, spreadsheetId, false);
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const values = res.data.values ?? [];
    if (values.length === 0) {
      return {
        content: [{ type: "text", text: "データが見つかりませんでした。" }],
      };
    }

    // ヘッダー行 + データ行をオブジェクト配列に変換
    const headers = values[0] as string[];
    const rows = values.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = (row[i] as string | undefined) ?? "";
      }
      return obj;
    });

    return {
      content: [{
        type: "text",
        text: encode({ range: res.data.range ?? range, rows }),
      }],
    };
  }
);

// 4. update-values
server.registerTool(
  "update-values",
  {
    description: "セル範囲に値を書き込む。access: readwrite のスプレッドシートのみ。",
    inputSchema: {
      spreadsheetId: z.string().describe("スプレッドシートID"),
      range: z.string().describe("書き込み範囲（A1表記。例: Sheet1!A1:D10）"),
      values: z.array(z.array(z.string())).describe("書き込む値の2次元配列（行×列）"),
    },
  },
  async ({ spreadsheetId, range, values }) => {
    const { allowed, reason } = checkAccess(permConfig, spreadsheetId, true);
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return {
      content: [{
        type: "text",
        text: `${res.data.updatedCells ?? 0}セルを更新しました（範囲: ${res.data.updatedRange ?? range}）。`,
      }],
    };
  }
);

// 5. append-values
server.registerTool(
  "append-values",
  {
    description: "テーブルの末尾に行を追記する。access: readwrite のスプレッドシートのみ。",
    inputSchema: {
      spreadsheetId: z.string().describe("スプレッドシートID"),
      range: z.string().describe("追記先の範囲（A1表記。例: Sheet1!A:D）"),
      values: z.array(z.array(z.string())).describe("追記する値の2次元配列（行×列）"),
    },
  },
  async ({ spreadsheetId, range, values }) => {
    const { allowed, reason } = checkAccess(permConfig, spreadsheetId, true);
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    return {
      content: [{
        type: "text",
        text: `${res.data.updates?.updatedRows ?? 0}行を追記しました（範囲: ${res.data.updates?.updatedRange ?? range}）。`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
