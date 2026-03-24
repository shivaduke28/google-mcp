import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  checkAccess,
  getProjectEntry,
  type PermissionConfig,
} from "../src/permissions.js";

const config: PermissionConfig = {
  allowedProjects: [
    { id: "proj-readonly", name: "読み取りプロジェクト", access: "readonly" },
    { id: "proj-readwrite", name: "読み書きプロジェクト", access: "readwrite" },
    {
      id: "proj-execute",
      name: "実行プロジェクト",
      access: "execute",
      extraScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    },
  ],
};

describe("checkAccess", () => {
  it("readonlyプロジェクトにreadonlyアクセスは許可", () => {
    const result = checkAccess(config, "proj-readonly", "readonly");
    assert.equal(result.allowed, true);
  });

  it("readonlyプロジェクトにreadwriteアクセスは拒否", () => {
    const result = checkAccess(config, "proj-readonly", "readwrite");
    assert.equal(result.allowed, false);
    assert.ok(result.reason);
  });

  it("readonlyプロジェクトにexecuteアクセスは拒否", () => {
    const result = checkAccess(config, "proj-readonly", "execute");
    assert.equal(result.allowed, false);
  });

  it("readwriteプロジェクトにreadonlyアクセスは許可", () => {
    const result = checkAccess(config, "proj-readwrite", "readonly");
    assert.equal(result.allowed, true);
  });

  it("readwriteプロジェクトにreadwriteアクセスは許可", () => {
    const result = checkAccess(config, "proj-readwrite", "readwrite");
    assert.equal(result.allowed, true);
  });

  it("readwriteプロジェクトにexecuteアクセスは拒否", () => {
    const result = checkAccess(config, "proj-readwrite", "execute");
    assert.equal(result.allowed, false);
  });

  it("executeプロジェクトに全レベルのアクセスは許可", () => {
    assert.equal(checkAccess(config, "proj-execute", "readonly").allowed, true);
    assert.equal(checkAccess(config, "proj-execute", "readwrite").allowed, true);
    assert.equal(checkAccess(config, "proj-execute", "execute").allowed, true);
  });

  it("allowlistに含まれないプロジェクトはアクセス拒否", () => {
    const result = checkAccess(config, "unknown-proj", "readonly");
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes("allowlist"));
  });

  it("config未設定の場合は全アクセス許可", () => {
    assert.equal(checkAccess(null, "any-proj", "readonly").allowed, true);
    assert.equal(checkAccess(null, "any-proj", "readwrite").allowed, true);
    assert.equal(checkAccess(null, "any-proj", "execute").allowed, true);
  });
});

describe("getProjectEntry", () => {
  it("存在するプロジェクトを返す", () => {
    const entry = getProjectEntry(config, "proj-execute");
    assert.equal(entry?.id, "proj-execute");
    assert.equal(entry?.access, "execute");
    assert.deepEqual(entry?.extraScopes, [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ]);
  });

  it("存在しないプロジェクトはundefinedを返す", () => {
    const entry = getProjectEntry(config, "unknown");
    assert.equal(entry, undefined);
  });

  it("config未設定の場合はundefinedを返す", () => {
    const entry = getProjectEntry(null, "proj-readonly");
    assert.equal(entry, undefined);
  });
});
