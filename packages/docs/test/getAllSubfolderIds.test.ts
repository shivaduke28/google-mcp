import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { getAllSubfolderIds } from "../src/permissions.js";

function createMockDrive(folderStructure: Record<string, string[]>) {
  return {
    files: {
      list: async ({ q }: { q: string }) => {
        const match = q.match(/'([^']+)' in parents/);
        const parentId = match?.[1] ?? "";
        const children = folderStructure[parentId] ?? [];
        return {
          data: {
            files: children.map((id) => ({ id })),
          },
        };
      },
    },
  } as any;
}

describe("getAllSubfolderIds", () => {
  it("単一レベルのサブフォルダを取得", async () => {
    const drive = createMockDrive({
      root: ["child-1", "child-2", "child-3"],
    });
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(result.sort(), ["child-1", "child-2", "child-3"]);
  });

  it("複数レベルのネスト（孫・ひ孫）を再帰的に取得", async () => {
    const drive = createMockDrive({
      root: ["child-1"],
      "child-1": ["grandchild-1", "grandchild-2"],
      "grandchild-1": ["great-grandchild-1"],
    });
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(
      result.sort(),
      ["child-1", "grandchild-1", "grandchild-2", "great-grandchild-1"]
    );
  });

  it("サブフォルダがない場合は空配列を返す", async () => {
    const drive = createMockDrive({});
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(result, []);
  });

  it("循環参照がある場合に無限ループしない", async () => {
    const drive = createMockDrive({
      root: ["child-1"],
      "child-1": ["child-2"],
      "child-2": ["root"],
    });
    const result = await getAllSubfolderIds(drive, "root");
    // rootは visited 済みなので再帰はしないが、child-2 の子としてresultには含まれる
    assert.deepEqual(result.sort(), ["child-1", "child-2", "root"]);
  });

  it("APIレスポンスのfilesが空配列の場合", async () => {
    const drive = createMockDrive({
      root: [],
    });
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(result, []);
  });

  it("APIレスポンスのfilesがundefinedの場合", async () => {
    const drive = {
      files: {
        list: async () => ({
          data: {
            files: undefined,
          },
        }),
      },
    } as any;
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(result, []);
  });

  it("fileにidがnullのエントリがある場合はスキップされる", async () => {
    const drive = {
      files: {
        list: async ({ q }: { q: string }) => {
          const match = q.match(/'([^']+)' in parents/);
          const parentId = match?.[1] ?? "";
          if (parentId === "root") {
            return {
              data: {
                files: [{ id: "child-1" }, { id: null }, { id: "child-2" }],
              },
            };
          }
          return { data: { files: [] } };
        },
      },
    } as any;
    const result = await getAllSubfolderIds(drive, "root");
    assert.deepEqual(result.sort(), ["child-1", "child-2"]);
  });
});
