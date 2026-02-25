import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  checkDocumentAccess,
  checkFolderAccess,
  isFileInAllowedFolder,
  type PermissionConfig,
} from "../src/permissions.js";

const config: PermissionConfig = {
  allowedDocuments: [
    { id: "doc-1", name: "ドキュメント1" },
    { id: "doc-2", name: "ドキュメント2" },
  ],
  allowedFolders: [
    { id: "folder-1", name: "フォルダ1" },
    { id: "folder-2", name: "フォルダ2" },
  ],
};

describe("checkDocumentAccess", () => {
  it("allowlistに含まれるドキュメントはアクセス許可", () => {
    const result = checkDocumentAccess(config, "doc-1");
    assert.equal(result.allowed, true);
  });

  it("allowlistに含まれないドキュメントはアクセス拒否", () => {
    const result = checkDocumentAccess(config, "unknown-doc");
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("allowlist"));
  });

  it("config未設定の場合は全アクセス許可", () => {
    const result = checkDocumentAccess(null, "any-doc");
    assert.equal(result.allowed, true);
  });
});

describe("checkFolderAccess", () => {
  it("allowlistに含まれるフォルダはアクセス許可", () => {
    const result = checkFolderAccess(config, "folder-1");
    assert.equal(result.allowed, true);
  });

  it("allowlistに含まれないフォルダはアクセス拒否", () => {
    const result = checkFolderAccess(config, "unknown-folder");
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("allowlist"));
  });

  it("config未設定の場合は全アクセス許可", () => {
    const result = checkFolderAccess(null, "any-folder");
    assert.equal(result.allowed, true);
  });
});

describe("isFileInAllowedFolder", () => {
  it("許可されたフォルダ内のファイルはtrue", () => {
    assert.equal(isFileInAllowedFolder(config, ["folder-1"]), true);
  });

  it("複数の親フォルダのうち1つが許可されていればtrue", () => {
    assert.equal(isFileInAllowedFolder(config, ["unknown", "folder-2"]), true);
  });

  it("許可されたフォルダに含まれないファイルはfalse", () => {
    assert.equal(isFileInAllowedFolder(config, ["unknown-folder"]), false);
  });

  it("親フォルダが空の場合はfalse", () => {
    assert.equal(isFileInAllowedFolder(config, []), false);
  });

  it("config未設定の場合は常にtrue", () => {
    assert.equal(isFileInAllowedFolder(null, []), true);
    assert.equal(isFileInAllowedFolder(null, ["any"]), true);
  });
});
