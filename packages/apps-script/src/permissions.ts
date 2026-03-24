import { loadConfig } from "@shivaduke28/google-mcp-auth";

export type AccessLevel = "readonly" | "readwrite" | "execute";

export interface ProjectEntry {
  id: string;
  name: string;
  access: AccessLevel;
  extraScopes?: string[];
}

export interface PermissionConfig {
  allowedProjects: ProjectEntry[];
}

const ACCESS_HIERARCHY: Record<AccessLevel, number> = {
  readonly: 0,
  readwrite: 1,
  execute: 2,
};

export async function loadPermissionConfig(
  configPath: string | undefined
): Promise<PermissionConfig | null> {
  return await loadConfig<PermissionConfig>(configPath, "apps-script");
}

export function checkAccess(
  config: PermissionConfig | null,
  scriptId: string,
  requiredLevel: AccessLevel
): { allowed: boolean; reason?: string } {
  // allowlist が未設定の場合は全アクセス許可
  if (!config) return { allowed: true };

  const entry = config.allowedProjects.find((e) => e.id === scriptId);
  if (!entry) {
    return {
      allowed: false,
      reason: `Apps Script プロジェクト (${scriptId}) はallowlistに登録されていません。`,
    };
  }

  if (ACCESS_HIERARCHY[entry.access] < ACCESS_HIERARCHY[requiredLevel]) {
    return {
      allowed: false,
      reason: `プロジェクト「${entry.name}」は${entry.access}です。この操作には${requiredLevel}権限が必要です。`,
    };
  }

  return { allowed: true };
}

export function getProjectEntry(
  config: PermissionConfig | null,
  scriptId: string
): ProjectEntry | undefined {
  if (!config) return undefined;
  return config.allowedProjects.find((e) => e.id === scriptId);
}
