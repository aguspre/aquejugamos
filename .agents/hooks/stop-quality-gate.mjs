import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const REVIEWER_AGENTS = new Set([
  "pr-reviewer",
  "security-reviewer",
  "backend-db-reviewer",
  "frontend-ui-reviewer",
]);

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOut(obj) {
  fs.writeSync(1, `${JSON.stringify(obj)}\n`);
}

function parseJsonString(val) {
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
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

function normalizeRel(filePath, repoRoot) {
  if (!filePath) return "";
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs).replace(/\\/g, "/");
  // Reject paths outside the repo (including cross-drive paths on Windows like "C:/...")
  if (!rel || path.isAbsolute(rel) || /^[a-zA-Z]:\//.test(rel) || rel === ".." || rel.startsWith("../")) {
    return "";
  }
  return rel;
}

function isSensitiveBasename(base) {
  const b = base.toLowerCase();
  return (
    b === ".env" ||
    (b.startsWith(".env.") && b !== ".env.example") ||
    b === "serviceaccountkey.json" ||
    (b.includes("firebase-adminsdk") && b.endsWith(".json")) ||
    b === ".neon"
  );
}

function analyzeTranscript(transcriptPath, repoRoot) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
  }

  let content;
  try {
    content = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }

  const lines = content.split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines
    }
  }

  // Find start of current user turn
  let turnStart = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === "USER_INPUT" && entries[i].source === "USER_EXPLICIT") {
      turnStart = i;
      break;
    }
  }

  const editedFiles = new Set();
  let lastCodeEditIndex = -1;
  const reviewerInvocations = [];

  for (let i = turnStart; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "PLANNER_RESPONSE" || !Array.isArray(entry.tool_calls)) {
      continue;
    }

    for (const tc of entry.tool_calls) {
      const name = String(tc.name || "").toLowerCase();
      const args = tc.args || {};

      if (name === "edit_file" || name === "write_file") {
        const rawPath = parseJsonString(args.Path ?? args.path ?? args.TargetFile ?? "");
        const rel = normalizeRel(String(rawPath || ""), repoRoot);
        if (rel) {
          editedFiles.add(rel);
          const lower = rel.toLowerCase();
          if (lower.startsWith("client/") || lower.startsWith("server/")) {
            lastCodeEditIndex = i;
          }
        }
      } else if (name === "invoke_subagent") {
        const typeName = String(parseJsonString(args.TypeName ?? args.typeName ?? "")).trim();
        if (REVIEWER_AGENTS.has(typeName)) {
          reviewerInvocations.push({ index: i, typeName });
        }
      }
    }
  }

  const reviewersAfterLastEdit = new Set(
    reviewerInvocations
      .filter((inv) => inv.index > lastCodeEditIndex)
      .map((inv) => inv.typeName),
  );

  return {
    editedFiles: [...editedFiles],
    hasProductionEdit: lastCodeEditIndex !== -1,
    reviewersAfterLastEdit,
  };
}

function runGitRaw(args, cwd, timeoutMs = 10_000) {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: res.status === 0 && !res.error,
    stdout: res.stdout || "",
  };
}

function runCmdAsync(command, args, cwd, timeoutMs = 45_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < 32_768) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 32_768) stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(err.message || err) });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`.trim();
      const truncated =
        combined.length > 2000 ? `${combined.slice(0, 2000)}\n...[salida truncada]` : combined;
      resolve({
        ok: !timedOut && code === 0,
        output: timedOut ? `Timeout tras ${timeoutMs / 1000}s.\n${truncated}` : truncated,
      });
    });
  });
}

function scanSecrets(repoRoot) {
  const issues = [];

  // 1. Check git status -z (NUL-separated, preserves leading spaces & handles renames cleanly)
  const statusRes = runGitRaw(["status", "--porcelain", "-z"], repoRoot, 8_000);
  if (statusRes.ok && statusRes.stdout) {
    const entries = statusRes.stdout.split("\0");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const xy = entry.slice(0, 2);
      const file = entry.slice(3).replace(/\\/g, "/");
      // For renames/copies (-z), the next NUL token is the original path
      if (xy.includes("R") || xy.includes("C")) {
        i++;
      }
      const base = file.split("/").pop() || "";
      if (isSensitiveBasename(base)) {
        issues.push(`Archivo sensible detectado en git status: ${file}`);
      }
    }
  }

  // 2. Scan ALL added lines in full git diff (staged + unstaged), without truncating output
  const privateKeyMarker = ["-----", "BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY", "-----"].join("");
  const secretPatterns = [
    { label: "Private Key PEM", regex: new RegExp(privateKeyMarker) },
    { label: "GitHub Personal Access Token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
    {
      label: "Database URL con credenciales",
      regex: /\bpostgres(?:ql)?:\/\/[^:\s"']+:(?!\$\{|your_|password\b|postgres\b|aquejugamos_dev\b)[^@\s"']+@(?!localhost\b|127\.0\.0\.1\b)/i,
    },
  ];

  for (const diffArgs of [["diff", "-U0"], ["diff", "--cached", "-U0"]]) {
    const diffRes = runGitRaw(diffArgs, repoRoot, 10_000);
    if (!diffRes.ok || !diffRes.stdout) continue;

    let currentFile = "";
    for (const line of diffRes.stdout.split(/\r?\n/)) {
      if (line.startsWith("+++ ")) {
        currentFile = line.startsWith("+++ b/") ? line.slice(6).trim() : "";
        continue;
      }
      if (!line.startsWith("+") || !currentFile) continue;
      const lowerFile = currentFile.toLowerCase();
      if (lowerFile.startsWith(".agents/hooks/") || lowerFile.endsWith(".env.example")) continue;

      for (const pat of secretPatterns) {
        if (pat.regex.test(line)) {
          issues.push(`Posible secreto (${pat.label}) agregado en ${currentFile}`);
        }
      }
    }
  }

  return [...new Set(issues)];
}

function checkReviewerCoverage({ clientTouched, serverTouched, turn }) {
  if (!turn || !turn.hasProductionEdit) return null;

  const reviewed = turn.reviewersAfterLastEdit;
  if (reviewed.has("pr-reviewer")) return null;

  if (clientTouched && serverTouched) {
    const hasFrontend = reviewed.has("frontend-ui-reviewer");
    const hasBackend = reviewed.has("backend-db-reviewer") || reviewed.has("security-reviewer");
    if (hasFrontend && hasBackend) return null;
    return (
      "Se modificó código full-stack (`client/` y `server/`). Ejecutá la evaluación multi-enfoque " +
      "(skill `multi-review`: `frontend-ui-reviewer` + `backend-db-reviewer` + `security-reviewer`) " +
      "o `pr-reviewer` después de la última edición."
    );
  }

  if (reviewed.size === 0) {
    return (
      "Se modificó código en `client/` o `server/` sin invocar un revisor (`pr-reviewer` o " +
      "evaluación multi-enfoque con `security-reviewer` / `backend-db-reviewer` / `frontend-ui-reviewer`) " +
      "después de la última edición."
    );
  }

  return null;
}

async function main() {
  const payload = readPayload();

  // Only gate normal turn completion, and never loop if continuation is already active
  if (payload.terminationReason !== "NO_TOOL_CALL" || payload.continuationActive === true) {
    writeOut({});
    return;
  }

  const repoRoot = resolveRepoRoot(payload);
  const turn = analyzeTranscript(payload.transcriptPath, repoRoot);

  // Skip gate when this conversation/turn made no in-repo file edits (Q&A or read-only subagents)
  if (turn && turn.editedFiles.length === 0) {
    writeOut({});
    return;
  }

  // Fallback if transcript is unavailable: inspect git status to avoid silently skipping checks
  let editedFiles = turn ? turn.editedFiles : [];
  if (!turn) {
    const statusRes = runGitRaw(["status", "--porcelain", "-z"], repoRoot, 8_000);
    if (statusRes.ok && statusRes.stdout) {
      const entries = statusRes.stdout.split("\0");
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const xy = entry.slice(0, 2);
        const file = entry.slice(3).replace(/\\/g, "/");
        if (xy.includes("R") || xy.includes("C")) i++;
        if (file) editedFiles.push(file);
      }
    }
    if (editedFiles.length === 0) {
      writeOut({});
      return;
    }
  }

  const lowerFiles = editedFiles.map((f) => f.toLowerCase());
  const clientTouched = lowerFiles.some((f) => f.startsWith("client/"));
  const serverTouched = lowerFiles.some((f) => f.startsWith("server/"));
  const prismaTouched = lowerFiles.some((f) => f.startsWith("server/prisma/"));

  const failures = [];

  // 1. Secret scan
  const secretIssues = scanSecrets(repoRoot);
  if (secretIssues.length > 0) {
    failures.push(`### Escaneo anti-secretos\n- ${secretIssues.join("\n- ")}`);
  }

  // 2. Run typechecks, tests & Prisma validation in parallel to stay well within hook timeout
  const tasks = [];
  if (clientTouched) {
    tasks.push({
      title: "Typecheck client falló",
      promise: runCmdAsync("npm", ["run", "typecheck", "--workspace=client"], repoRoot, 45_000),
    });
  }
  if (serverTouched) {
    tasks.push({
      title: "Typecheck server falló",
      promise: runCmdAsync("npm", ["run", "typecheck", "--workspace=server"], repoRoot, 45_000),
    });
    tasks.push({
      title: "Tests server (Vitest) fallaron",
      promise: runCmdAsync("npm", ["run", "test", "--workspace=server"], repoRoot, 45_000),
    });
  }
  if (prismaTouched) {
    tasks.push({
      title: "Validación Prisma falló",
      promise: runCmdAsync("npm", ["run", "db:validate", "--workspace=server"], repoRoot, 30_000),
    });
  }

  const results = await Promise.all(
    tasks.map(async (t) => ({ title: t.title, res: await t.promise })),
  );
  for (const { title, res } of results) {
    if (!res.ok) {
      failures.push(`### ${title}\n\`\`\`\n${res.output}\n\`\`\``);
    }
  }

  // 3. Reviewer enforcement for production code edits
  const reviewWarning = checkReviewerCoverage({ clientTouched, serverTouched, turn });
  if (reviewWarning) {
    failures.push(`### Revisión de código pendiente\n${reviewWarning}`);
  }

  if (failures.length > 0) {
    writeOut({
      decision: "continue",
      reason: `El hook quality-gate detectó pendientes antes de finalizar el turno:\n\n${failures.join("\n\n")}\n\nCorregí estos puntos antes de dar la respuesta final al usuario.`,
    });
    return;
  }

  writeOut({});
}

await main();
