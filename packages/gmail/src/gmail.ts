import type { gmail_v1 } from "@googleapis/gmail";

export interface MessageHeaders {
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
}

export function extractHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined
): MessageHeaders {
  const get = (name: string): string => {
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
  };

  return {
    from: get("From"),
    to: get("To"),
    cc: get("Cc"),
    subject: get("Subject"),
    date: get("Date"),
  };
}

export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) return "";

  // text/plain を直接持っている場合
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // multipart の場合は再帰的にパース
  if (payload.parts) {
    // まず text/plain を探す
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // text/plain がなければ再帰的に探す
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildRawMessage(
  to: string[],
  cc: string[],
  subject: string,
  body: string,
  threadId?: string,
  inReplyTo?: string,
  references?: string
): string {
  const lines: string[] = [];
  lines.push(`To: ${to.join(", ")}`);
  if (cc.length > 0) {
    lines.push(`Cc: ${cc.join(", ")}`);
  }
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    lines.push(`References: ${references}`);
  }

  lines.push("");
  lines.push(Buffer.from(body).toString("base64"));

  return encodeBase64Url(lines.join("\r\n"));
}
