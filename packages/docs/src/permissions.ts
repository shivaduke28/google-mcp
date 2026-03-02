import { loadConfig } from "@shivaduke28/google-mcp-auth";
import type { drive_v3 } from "@googleapis/drive";

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

const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

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

/**
 * 指定フォルダ配下の全サブフォルダIDを再帰的に取得する。
 * visited セットで循環参照を防止。
 */
export async function getAllSubfolderIds(
  drive: drive_v3.Drive,
  folderId: string
): Promise<string[]> {
  const result: string[] = [];
  const visited = new Set<string>();

  async function collect(parentId: string): Promise<void> {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = '${GOOGLE_FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "files(id)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const file of res.data.files ?? []) {
      if (file.id) {
        result.push(file.id);
        await collect(file.id);
      }
    }
  }

  await collect(folderId);
  return result;
}

/**
 * ファイルの親IDから祖先方向にたどり、allowedFolders のいずれかに到達するか確認する。
 * visited セットで無限ループを防止。
 */
export async function isDescendantOfAllowedFolder(
  drive: drive_v3.Drive,
  config: PermissionConfig | null,
  parentIds: string[]
): Promise<boolean> {
  if (!config) return true;

  const allowedFolderIds = new Set(
    config.allowedFolders.map((folder) => folder.id)
  );
  const visited = new Set<string>();

  async function checkAncestors(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      if (visited.has(id)) continue;
      visited.add(id);

      if (allowedFolderIds.has(id)) return true;

      try {
        const res = await drive.files.get({
          fileId: id,
          fields: "parents",
          supportsAllDrives: true,
        });
        const grandParents = res.data.parents ?? [];
        if (grandParents.length > 0) {
          if (await checkAncestors(grandParents)) return true;
        }
      } catch {
        // ファイルが見つからない場合等はスキップ
      }
    }
    return false;
  }

  return checkAncestors(parentIds);
}
