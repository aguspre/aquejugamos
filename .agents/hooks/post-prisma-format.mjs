import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function resolveRepoRoot(payload) {
  const candidates = [
    path.resolve(import.meta.dirname, "..", ".."),
    payload.workspacePaths?.[0],
    payload.cwd,
  ].filter((c) => typeof c === "string" && c.length > 0 && !c.startsWith("file://"));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
  }
  return candidates[0] || process.cwd();
}

const payload = readPayload();

if (!payload.error) {
  const args = payload.toolCall?.args || {};
  const rawPath = String(args.Path ?? args.path ?? args.TargetFile ?? "");
  const norm = path.posix.normalize(rawPath.replace(/\\/g, "/")).toLowerCase();

  if (/(^|\/)prisma\/schema\.prisma$/.test(norm) || norm === "schema.prisma") {
    const repoRoot = resolveRepoRoot(payload);
    const res = spawnSync("npm", ["run", "db:format", "--workspace=server"], {
      cwd: repoRoot,
      shell: process.platform === "win32",
      encoding: "utf8",
      timeout: 12_000,
    });

    if (res.status !== 0 && res.stderr) {
      process.stderr.write(`[prisma-format] advertencia: ${res.stderr.trim()}\n`);
    }
  }
}

fs.writeSync(1, "{}\n");
