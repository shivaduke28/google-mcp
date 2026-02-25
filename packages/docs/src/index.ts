#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { encode } from "@toon-format/toon";
import { authorize, resolvePath } from "@shivaduke28/google-mcp-auth";
import { drive as googleDrive } from "@googleapis/drive";
import {
  loadPermissionConfig,
  checkDocumentAccess,
  checkFolderAccess,
  isFileInAllowedFolder,
} from "./permissions.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";
const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const rawCredentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS;
const configPath = process.env.GOOGLE_MCP_CONFIG
  ? resolvePath(process.env.GOOGLE_MCP_CONFIG)
  : undefined;

if (!rawCredentialsPath) {
  console.error("GOOGLE_OAUTH_CREDENTIALS 環境変数を設定してください");
  process.exit(1);
}
const credentialsPath = resolvePath(rawCredentialsPath);
if (!existsSync(credentialsPath)) {
  console.error(`credentials.json が見つかりません: ${credentialsPath}`);
  process.exit(1);
}

const resolvedCredentialsPath: string = credentialsPath;
const resolvedTokensPath: string = process.env.GOOGLE_OAUTH_TOKENS
  ? resolvePath(process.env.GOOGLE_OAUTH_TOKENS)
  : join(homedir(), ".config", "google-docs-mcp", "tokens.json");

// パーミッション設定
const permConfig = await loadPermissionConfig(configPath);

// lazy auth: ツール呼び出し時に初めて認証する
let driveClient: ReturnType<typeof googleDrive> | null = null;

async function getDrive() {
  if (!driveClient) {
    const auth = await authorize(
      resolvedCredentialsPath,
      resolvedTokensPath,
      SCOPES
    );
    driveClient = googleDrive({ version: "v3", auth });
  }
  return driveClient;
}

const server = new McpServer({
  name: "google-docs-mcp",
  version: "1.0.0",
});

// 1. list-documents
server.registerTool(
  "list-documents",
  {
    description:
      "allowlistに登録されたドキュメントとフォルダの一覧を返す。レスポンスはTOON形式で返す。",
    inputSchema: {},
  },
  async () => {
    if (!permConfig) {
      return {
        content: [
          {
            type: "text" as const,
            text: "allowlistが設定されていません。GOOGLE_MCP_CONFIG 環境変数で設定ファイルを指定してください。",
          },
        ],
      };
    }

    const documents = (permConfig.allowedDocuments ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: "document",
    }));

    const folders = (permConfig.allowedFolders ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: "folder",
    }));

    const items = [...documents, ...folders];

    return {
      content: [
        {
          type: "text" as const,
          text:
            items.length > 0
              ? encode({ allowedItems: items })
              : "allowlistにドキュメント/フォルダが登録されていません。",
        },
      ],
    };
  }
);

// 2. list-folder
server.registerTool(
  "list-folder",
  {
    description:
      "許可されたフォルダ内のGoogle Docsファイル一覧を取得する。レスポンスはTOON形式で返す。",
    inputSchema: {
      folderId: z.string().describe("フォルダID"),
      pageToken: z
        .string()
        .optional()
        .describe("次ページのトークン（ページネーション用）"),
    },
  },
  async ({ folderId, pageToken }) => {
    const { allowed, reason } = checkFolderAccess(permConfig, folderId);
    if (!allowed) {
      return { content: [{ type: "text" as const, text: reason! }], isError: true };
    }

    const drive = await getDrive();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = '${GOOGLE_DOCS_MIME_TYPE}' and trashed = false`,
      fields:
        "nextPageToken, files(id, name, modifiedTime, lastModifyingUser/displayName)",
      pageSize: 50,
      orderBy: "modifiedTime desc",
      pageToken: pageToken ?? undefined,
    });

    const files = (res.data.files ?? []).map((file) => ({
      id: file.id ?? "",
      name: file.name ?? "",
      modifiedTime: file.modifiedTime ?? "",
      lastModifiedBy: file.lastModifyingUser?.displayName ?? "",
    }));

    const result: Record<string, unknown> = { files };
    if (res.data.nextPageToken) {
      result.nextPageToken = res.data.nextPageToken;
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            files.length > 0
              ? encode(result)
              : "フォルダ内にGoogle Docsが見つかりませんでした。",
        },
      ],
    };
  }
);

// 3. read-document
server.registerTool(
  "read-document",
  {
    description:
      "Google Docsのドキュメント内容を取得する。デフォルトはHTML形式（見出し・リスト・テーブル等の構造を保持）。allowlistに登録されたドキュメント、または許可されたフォルダ内のドキュメントのみ読み取り可能。",
    inputSchema: {
      fileId: z
        .string()
        .describe(
          "ドキュメントのファイルID（Google DocsのURLの /d/XXXXX/ 部分）"
        ),
      format: z
        .enum(["html", "text"])
        .optional()
        .default("html")
        .describe(
          "出力形式。html: 見出し・リスト・テーブル等の構造を保持（デフォルト）、text: プレーンテキスト"
        ),
    },
  },
  async ({ fileId, format }) => {
    // まず直接allowlistを確認
    const directAccess = checkDocumentAccess(permConfig, fileId);

    if (!directAccess.allowed) {
      // フォルダ経由のアクセスを確認
      const drive = await getDrive();
      const fileMeta = await drive.files.get({
        fileId,
        fields: "id, name, mimeType, parents",
      });

      if (fileMeta.data.mimeType !== GOOGLE_DOCS_MIME_TYPE) {
        return {
          content: [
            {
              type: "text" as const,
              text: `指定されたファイルはGoogle Docsではありません (mimeType: ${fileMeta.data.mimeType})。`,
            },
          ],
          isError: true,
        };
      }

      const parentIds = fileMeta.data.parents ?? [];
      if (!isFileInAllowedFolder(permConfig, parentIds)) {
        return {
          content: [{ type: "text" as const, text: directAccess.reason! }],
          isError: true,
        };
      }
    }

    const drive = await getDrive();

    // ドキュメントのメタデータを取得
    const meta = await drive.files.get({
      fileId,
      fields: "id, name, modifiedTime, lastModifyingUser/displayName",
    });

    // Google Docs をエクスポート
    const exportMimeType =
      format === "text" ? "text/plain" : "text/html";
    const res = await drive.files.export({
      fileId,
      mimeType: exportMimeType,
    });

    const content = typeof res.data === "string" ? res.data : String(res.data);

    return {
      content: [
        {
          type: "text" as const,
          text: encode({
            document: {
              id: meta.data.id ?? fileId,
              name: meta.data.name ?? "",
              modifiedTime: meta.data.modifiedTime ?? "",
              lastModifiedBy: meta.data.lastModifyingUser?.displayName ?? "",
              format,
              content,
            },
          }),
        },
      ],
    };
  }
);

// 4. search-documents
server.registerTool(
  "search-documents",
  {
    description:
      "許可されたフォルダ内のGoogle Docsをファイル名で検索する。レスポンスはTOON形式で返す。",
    inputSchema: {
      query: z
        .string()
        .describe("検索キーワード（ファイル名に対する部分一致検索）"),
    },
  },
  async ({ query }) => {
    if (!permConfig) {
      return {
        content: [
          {
            type: "text" as const,
            text: "allowlistが設定されていません。GOOGLE_MCP_CONFIG 環境変数で設定ファイルを指定してください。",
          },
        ],
      };
    }

    const drive = await getDrive();
    const allFiles: Array<{
      id: string;
      name: string;
      modifiedTime: string;
      lastModifiedBy: string;
      folder: string;
    }> = [];

    // 許可されたフォルダ内を検索
    for (const folder of permConfig.allowedFolders ?? []) {
      const escapedQuery = query.replace(/'/g, "\\'");
      const res = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType = '${GOOGLE_DOCS_MIME_TYPE}' and name contains '${escapedQuery}' and trashed = false`,
        fields:
          "files(id, name, modifiedTime, lastModifyingUser/displayName)",
        pageSize: 20,
        orderBy: "modifiedTime desc",
      });

      for (const file of res.data.files ?? []) {
        allFiles.push({
          id: file.id ?? "",
          name: file.name ?? "",
          modifiedTime: file.modifiedTime ?? "",
          lastModifiedBy: file.lastModifyingUser?.displayName ?? "",
          folder: folder.name,
        });
      }
    }

    // 許可されたドキュメントも名前でフィルタ
    const lowerQuery = query.toLowerCase();
    const matchedDocs = (permConfig.allowedDocuments ?? [])
      .filter((doc) => doc.name.toLowerCase().includes(lowerQuery))
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        modifiedTime: "",
        lastModifiedBy: "",
        folder: "(直接登録)",
      }));

    const results = [...allFiles, ...matchedDocs];

    return {
      content: [
        {
          type: "text" as const,
          text:
            results.length > 0
              ? encode({ results })
              : `「${query}」に一致するドキュメントが見つかりませんでした。`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
