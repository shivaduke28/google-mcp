import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  isDescendantOfAllowedFolder,
  type PermissionConfig,
} from "../src/permissions.js";

function createMockDrive(parentMap: Record<string, string[]>) {
  return {
    files: {
      get: async ({ fileId }: { fileId: string }) => {
        if (!(fileId in parentMap)) {
          throw new Error(`File not found: ${fileId}`);
        }
        return {
          data: {
            parents: parentMap[fileId],
          },
        };
      },
    },
  } as any;
}

const config: PermissionConfig = {
  allowedDocuments: [],
  allowedFolders: [
    { id: "allowed-1", name: "許可フォルダ1" },
    { id: "allowed-2", name: "許可フォルダ2" },
  ],
};

describe("isDescendantOfAllowedFolder", () => {
  it("直接の親がallowedFolderの場合はtrue", async () => {
    const drive = createMockDrive({});
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "allowed-1",
    ]);
    assert.equal(result, true);
  });

  it("祖父フォルダがallowedFolder（2段ネスト）の場合はtrue", async () => {
    const drive = createMockDrive({
      "child-folder": ["allowed-1"],
    });
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "child-folder",
    ]);
    assert.equal(result, true);
  });

  it("3段以上のネストでもallowedFolderに到達すればtrue", async () => {
    const drive = createMockDrive({
      level3: ["level2"],
      level2: ["level1"],
      level1: ["allowed-2"],
    });
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "level3",
    ]);
    assert.equal(result, true);
  });

  it("allowedFolderにたどり着かない場合はfalse", async () => {
    const drive = createMockDrive({
      "folder-a": ["folder-b"],
      "folder-b": ["root"],
      root: [],
    });
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "folder-a",
    ]);
    assert.equal(result, false);
  });

  it("parentIdsが空配列の場合はfalse", async () => {
    const drive = createMockDrive({});
    const result = await isDescendantOfAllowedFolder(drive, config, []);
    assert.equal(result, false);
  });

  it("configがnullの場合はtrue", async () => {
    const drive = createMockDrive({});
    const result = await isDescendantOfAllowedFolder(drive, null, [
      "any-folder",
    ]);
    assert.equal(result, true);
  });

  it("循環参照がある場合に無限ループせずfalseを返す", async () => {
    const drive = createMockDrive({
      "cycle-a": ["cycle-b"],
      "cycle-b": ["cycle-c"],
      "cycle-c": ["cycle-a"],
    });
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "cycle-a",
    ]);
    assert.equal(result, false);
  });

  it("drive.files.getがエラーをthrowする場合はfalse", async () => {
    const drive = createMockDrive({});
    // parentMap に存在しない ID を渡すと throw される
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "unknown-folder",
    ]);
    assert.equal(result, false);
  });

  it("複数のparentIdsで一方がallowedFolderの場合はtrue", async () => {
    const drive = createMockDrive({});
    const result = await isDescendantOfAllowedFolder(drive, config, [
      "not-allowed",
      "allowed-2",
    ]);
    assert.equal(result, true);
  });
});
