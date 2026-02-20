import { homedir } from "node:os";
import { join } from "node:path";

/**
 * パス先頭の `~` を $HOME に展開する。
 */
export function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  if (p === "~") {
    return homedir();
  }
  return p;
}
