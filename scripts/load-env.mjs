/** Load KEY=value lines from .env.local into process.env. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {{ overridePrefixes?: string[] }} [opts]
 * Keys matching overridePrefixes always win over existing process.env.
 */
export function loadEnvLocal(opts = {}) {
  const prefixes = opts.overridePrefixes ?? [];
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, "");
    const force = prefixes.some((p) => key.startsWith(p));
    if (force || !process.env[key]) process.env[key] = value;
  }
}

export function upsertEnvLocal(updates) {
  const file = path.join(root, ".env.local");
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
    process.env[key] = value;
  }
  fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
}

export const projectRoot = root;
