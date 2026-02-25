import { loadConfig } from "@shivaduke28/google-mcp-auth";

export interface DocumentEntry {
  id: string;
  name: string;
}

export interface FolderEntry {
  id: string;
  name: string;
}

export interface PermissionConfig {
  allowedDocuments: DocumentEntry[];
  allowedFolders: FolderEntry[];
}

export async function loadPermissionConfig(
  configPath: string | undefined
): Promise<PermissionConfig | null> {
  return await loadConfig<PermissionConfig>(configPath, "docs");
}

export function checkDocumentAccess(
  config: PermissionConfig | null,
  fileId: string
): { allowed: boolean; reason?: string } {
  // allowlist が未設定の場合は全アクセス許可
  if (!config) return { allowed: true };

  const entry = config.allowedDocuments.find((e) => e.id === fileId);
  if (entry) return { allowed: true };

  return {
    allowed: false,
    reason: `ドキュメント (${fileId}) はallowlistに登録されていません。allowedDocumentsに追加するか、allowedFoldersに含まれるフォルダ内のドキュメントを指定してください。`,
  };
}

export function checkFolderAccess(
  config: PermissionConfig | null,
  folderId: string
): { allowed: boolean; reason?: string } {
  if (!config) return { allowed: true };

  const entry = config.allowedFolders.find((e) => e.id === folderId);
  if (entry) return { allowed: true };

  return {
    allowed: false,
    reason: `フォルダ (${folderId}) はallowlistに登録されていません。`,
  };
}

export function isFileInAllowedFolder(
  config: PermissionConfig | null,
  parentIds: string[]
): boolean {
  if (!config) return true;

  return parentIds.some((parentId) =>
    config.allowedFolders.some((folder) => folder.id === parentId)
  );
}
