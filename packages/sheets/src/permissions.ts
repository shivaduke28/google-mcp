import { loadConfig } from "@shivaduke28/google-mcp-auth";

export interface SpreadsheetEntry {
  id: string;
  name: string;
  access: "readonly" | "readwrite";
}

export interface PermissionConfig {
  allowedSpreadsheets: SpreadsheetEntry[];
}

export async function loadPermissionConfig(
  configPath: string | undefined
): Promise<PermissionConfig | null> {
  return await loadConfig<PermissionConfig>(configPath, "sheets");
}

export function checkAccess(
  config: PermissionConfig | null,
  spreadsheetId: string,
  requireWrite: boolean
): { allowed: boolean; reason?: string } {
  // allowlist が未設定の場合は全アクセス許可
  if (!config) return { allowed: true };

  const entry = config.allowedSpreadsheets.find((e) => e.id === spreadsheetId);
  if (!entry) {
    return { allowed: false, reason: `スプレッドシート (${spreadsheetId}) はallowlistに登録されていません。` };
  }

  if (requireWrite && entry.access === "readonly") {
    return { allowed: false, reason: `スプレッドシート「${entry.name}」は読み取り専用です。` };
  }

  return { allowed: true };
}
