#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { encode } from "@toon-format/toon";
import { authorize, resolvePath } from "@shivaduke28/google-mcp-auth";
import { script as googleScript } from "@googleapis/script";
import {
  loadPermissionConfig,
  checkAccess,
  type PermissionConfig,
} from "./permissions.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_SCOPES = [
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.projects.readonly",
];

function collectAllScopes(config: PermissionConfig | null): string[] {
  const scopes = new Set(BASE_SCOPES);
  if (config) {
    for (const project of config.allowedProjects) {
      if (project.access === "execute" && project.extraScopes) {
        for (const scope of project.extraScopes) {
          scopes.add(scope);
        }
      }
    }
  }
  return [...scopes];
}

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
  : join(homedir(), ".config", "google-apps-script-mcp", "tokens.json");

// パーミッション設定
const permConfig = await loadPermissionConfig(configPath);
const SCOPES = collectAllScopes(permConfig);

// lazy auth: ツール呼び出し時に初めて認証する
let scriptClient: ReturnType<typeof googleScript> | null = null;

async function getScript() {
  if (!scriptClient) {
    const auth = await authorize(
      resolvedCredentialsPath,
      resolvedTokensPath,
      SCOPES
    );
    scriptClient = googleScript({ version: "v1", auth });
  }
  return scriptClient;
}

const server = new McpServer({
  name: "google-apps-script-mcp",
  version: "1.0.0",
});

// 1. list-projects
server.registerTool(
  "list-projects",
  {
    description:
      "allowlistに登録されたApps Scriptプロジェクト一覧を返す。レスポンスはTOON形式で返す。",
    inputSchema: {},
  },
  async () => {
    if (!permConfig) {
      return {
        content: [
          {
            type: "text",
            text: "allowlistが設定されていません。GOOGLE_MCP_CONFIG 環境変数で設定ファイルを指定してください。",
          },
        ],
      };
    }

    const rows = permConfig.allowedProjects.map((entry) => ({
      id: entry.id,
      name: entry.name,
      access: entry.access,
    }));

    return {
      content: [
        {
          type: "text",
          text:
            rows.length > 0
              ? encode({ projects: rows })
              : "allowlistにプロジェクトが登録されていません。",
        },
      ],
    };
  }
);

// 2. get-project
server.registerTool(
  "get-project",
  {
    description:
      "Apps Scriptプロジェクトのメタデータを取得する。レスポンスはTOON形式で返す。",
    inputSchema: {
      scriptId: z.string().describe("Apps ScriptプロジェクトID"),
    },
  },
  async ({ scriptId }) => {
    const { allowed, reason } = checkAccess(permConfig, scriptId, "readonly");
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const client = await getScript();
    const res = await client.projects.get({ scriptId });

    return {
      content: [
        {
          type: "text",
          text: encode({
            scriptId: res.data.scriptId ?? "",
            title: res.data.title ?? "",
            createTime: res.data.createTime ?? "",
            updateTime: res.data.updateTime ?? "",
            parentId: res.data.parentId ?? "",
          }),
        },
      ],
    };
  }
);

// 3. get-content
server.registerTool(
  "get-content",
  {
    description:
      "Apps Scriptプロジェクトのソースファイル一覧と内容を取得する。レスポンスはTOON形式で返す。",
    inputSchema: {
      scriptId: z.string().describe("Apps ScriptプロジェクトID"),
    },
  },
  async ({ scriptId }) => {
    const { allowed, reason } = checkAccess(permConfig, scriptId, "readonly");
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const client = await getScript();
    const res = await client.projects.getContent({ scriptId });

    const files = (res.data.files ?? []).map((f) => ({
      name: f.name ?? "",
      type: f.type ?? "",
      source: f.source ?? "",
    }));

    return {
      content: [
        {
          type: "text",
          text: encode({ scriptId, files }),
        },
      ],
    };
  }
);

// 4. update-content
server.registerTool(
  "update-content",
  {
    description:
      "Apps Scriptプロジェクトのソースファイルを更新する。access: readwrite以上のプロジェクトのみ。注意: 指定したファイルでプロジェクト全体を置き換えます。既存ファイルを保持するには、get-contentで取得した全ファイルを含めてください。",
    inputSchema: {
      scriptId: z.string().describe("Apps ScriptプロジェクトID"),
      files: z
        .array(
          z.object({
            name: z.string().describe("ファイル名（拡張子なし）"),
            type: z
              .enum(["SERVER_JS", "HTML", "JSON"])
              .describe("ファイルタイプ"),
            source: z.string().describe("ファイルの内容"),
          })
        )
        .describe(
          "更新するファイルの配列。プロジェクト全体をこの内容で置き換えます。"
        ),
    },
  },
  async ({ scriptId, files }) => {
    const { allowed, reason } = checkAccess(
      permConfig,
      scriptId,
      "readwrite"
    );
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const client = await getScript();
    await client.projects.updateContent({
      scriptId,
      requestBody: { files },
    });

    return {
      content: [
        {
          type: "text",
          text: `プロジェクトを更新しました（${files.length}ファイル）。`,
        },
      ],
    };
  }
);

// 5. run-function
server.registerTool(
  "run-function",
  {
    description:
      "Apps Scriptプロジェクトの関数を実行する。access: executeのプロジェクトのみ。対象スクリプトはAPI実行用にデプロイされている必要があります。",
    inputSchema: {
      scriptId: z.string().describe("Apps ScriptプロジェクトID"),
      functionName: z.string().describe("実行する関数名"),
      parameters: z
        .array(z.unknown())
        .optional()
        .describe("関数に渡すパラメータの配列"),
    },
  },
  async ({ scriptId, functionName, parameters }) => {
    const { allowed, reason } = checkAccess(permConfig, scriptId, "execute");
    if (!allowed) {
      return { content: [{ type: "text", text: reason! }], isError: true };
    }

    const client = await getScript();
    const res = await client.scripts.run({
      scriptId,
      requestBody: {
        function: functionName,
        parameters: parameters ?? [],
      },
    });

    if (res.data.error) {
      const err = res.data.error;
      const details = (err.details ?? [])
        .map((d) => {
          const typed = d as Record<string, unknown>;
          const errorType = typed["errorType"] ?? "";
          const errorMessage = typed["errorMessage"] ?? "";
          const trace = typed["scriptStackTraceElements"];
          const traceStr = Array.isArray(trace)
            ? trace
                .map(
                  (e: Record<string, unknown>) =>
                    `  at ${e["function"]} (${e["lineNumber"]})`
                )
                .join("\n")
            : "";
          return `${errorType}: ${errorMessage}${traceStr ? `\n${traceStr}` : ""}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `関数実行エラー: ${err.message ?? "不明なエラー"}${details ? `\n${details}` : ""}`,
          },
        ],
        isError: true,
      };
    }

    const result = res.data.response;
    return {
      content: [
        {
          type: "text",
          text: result
            ? encode({ result: (result as Record<string, unknown>)["result"] })
            : "関数が正常に実行されました（戻り値なし）。",
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
