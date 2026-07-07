#!/usr/bin/env node
/** Apply butterbase/graph-schema.cypher via Neo4j HTTP Query API (no neo4j-cli required). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv(envPath);

const uri = process.env.NEO4J_URI;
const username = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE || "neo4j";

if (!uri || !username || !password) {
  console.error("Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in .env.local");
  process.exit(1);
}

const host = uri.replace(/^neo4j(\+s)?:\/\//, "").replace(/\/$/, "");
const url = `https://${host}/db/${database}/query/v2`;
const auth = Buffer.from(`${username}:${password}`).toString("base64");

const cypherFile = path.join(root, "butterbase/graph-schema.cypher");
const raw = fs.readFileSync(cypherFile, "utf8");
const statements = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n")
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

let ok = 0;
for (const statement of statements) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statement }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`✖ Failed: ${statement.slice(0, 60)}...`);
    console.error(`  ${res.status} ${err}`);
    process.exit(1);
  }
  ok++;
}

console.log(`✓ Applied ${ok} schema statements to ${database}@${host}`);
