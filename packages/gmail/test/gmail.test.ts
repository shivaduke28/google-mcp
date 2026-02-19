import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractHeaders, extractBody, buildRawMessage } from "../src/gmail.js";

describe("extractHeaders", () => {
  it("ヘッダーからFrom/To/Cc/Subject/Dateを抽出する", () => {
    const headers = [
      { name: "From", value: "alice@example.com" },
      { name: "To", value: "bob@example.com" },
      { name: "Cc", value: "carol@example.com" },
      { name: "Subject", value: "Hello" },
      { name: "Date", value: "Mon, 10 Feb 2026 12:00:00 +0900" },
    ];
    const result = extractHeaders(headers);
    assert.equal(result.from, "alice@example.com");
    assert.equal(result.to, "bob@example.com");
    assert.equal(result.cc, "carol@example.com");
    assert.equal(result.subject, "Hello");
    assert.equal(result.date, "Mon, 10 Feb 2026 12:00:00 +0900");
  });

  it("ヘッダーが大文字小文字混在でもマッチする", () => {
    const headers = [
      { name: "from", value: "alice@example.com" },
      { name: "SUBJECT", value: "Test" },
    ];
    const result = extractHeaders(headers);
    assert.equal(result.from, "alice@example.com");
    assert.equal(result.subject, "Test");
  });

  it("存在しないヘッダーは空文字を返す", () => {
    const result = extractHeaders([]);
    assert.equal(result.from, "");
    assert.equal(result.to, "");
    assert.equal(result.cc, "");
    assert.equal(result.subject, "");
    assert.equal(result.date, "");
  });

  it("undefinedの場合も空文字を返す", () => {
    const result = extractHeaders(undefined);
    assert.equal(result.from, "");
  });
});

describe("extractBody", () => {
  it("text/plainのbodyをデコードする", () => {
    const base64url = Buffer.from("Hello, World!").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = {
      mimeType: "text/plain",
      body: { data: base64url },
    };
    assert.equal(extractBody(payload), "Hello, World!");
  });

  it("multipartからtext/plainを抽出する", () => {
    const textData = Buffer.from("Plain text body").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const htmlData = Buffer.from("<p>HTML body</p>").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: textData } },
        { mimeType: "text/html", body: { data: htmlData } },
      ],
    };
    assert.equal(extractBody(payload), "Plain text body");
  });

  it("ネストしたmultipartからtext/plainを再帰的に抽出する", () => {
    const textData = Buffer.from("Nested plain").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: textData } },
          ],
        },
      ],
    };
    assert.equal(extractBody(payload), "Nested plain");
  });

  it("payloadがundefinedなら空文字を返す", () => {
    assert.equal(extractBody(undefined), "");
  });

  it("bodyがないパートはスキップされる", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: {} },
        { mimeType: "text/plain", body: { data: Buffer.from("Found").toString("base64") } },
      ],
    };
    assert.equal(extractBody(payload), "Found");
  });

  it("日本語のbodyをデコードする", () => {
    const text = "こんにちは世界";
    const base64url = Buffer.from(text).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = {
      mimeType: "text/plain",
      body: { data: base64url },
    };
    assert.equal(extractBody(payload), text);
  });
});

describe("buildRawMessage", () => {
  it("基本的なメッセージをbase64urlエンコードする", () => {
    const raw = buildRawMessage(
      ["bob@example.com"],
      [],
      "Test Subject",
      "Hello Bob"
    );
    // base64urlなので+や/や=は含まれない
    assert.ok(!raw.includes("+"));
    assert.ok(!raw.includes("/"));
    assert.ok(!raw.includes("="));

    // デコードして中身を確認
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    assert.ok(decoded.includes("To: bob@example.com"));
    assert.ok(decoded.includes("MIME-Version: 1.0"));
    assert.ok(decoded.includes("Content-Type: text/plain; charset=UTF-8"));
  });

  it("CCが含まれる場合Ccヘッダーが付く", () => {
    const raw = buildRawMessage(
      ["bob@example.com"],
      ["carol@example.com", "dave@example.com"],
      "With CC",
      "Hello"
    );
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    assert.ok(decoded.includes("Cc: carol@example.com, dave@example.com"));
  });

  it("CCが空の場合Ccヘッダーが付かない", () => {
    const raw = buildRawMessage(
      ["bob@example.com"],
      [],
      "No CC",
      "Hello"
    );
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    assert.ok(!decoded.includes("Cc:"));
  });

  it("日本語の件名がBase64エンコードされる", () => {
    const raw = buildRawMessage(
      ["bob@example.com"],
      [],
      "テスト件名",
      "本文"
    );
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    assert.ok(decoded.includes("Subject: =?UTF-8?B?"));
    // Subject内のbase64をデコードして確認
    const match = decoded.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/);
    assert.ok(match);
    const subject = Buffer.from(match![1], "base64").toString("utf-8");
    assert.equal(subject, "テスト件名");
  });

  it("返信時にIn-Reply-ToとReferencesヘッダーが付く", () => {
    const raw = buildRawMessage(
      ["bob@example.com"],
      [],
      "Re: Test",
      "Reply body",
      "thread123",
      "<msg-id-123@mail.gmail.com>",
      "<msg-id-000@mail.gmail.com> <msg-id-123@mail.gmail.com>"
    );
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    assert.ok(decoded.includes("In-Reply-To: <msg-id-123@mail.gmail.com>"));
    assert.ok(decoded.includes("References: <msg-id-000@mail.gmail.com> <msg-id-123@mail.gmail.com>"));
  });
});
