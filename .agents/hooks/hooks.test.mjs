import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const AGENTS_DIR = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(AGENTS_DIR, "..");

function runHook(script, payload, { rawInput } = {}) {
  const input = rawInput !== undefined ? rawInput : JSON.stringify(payload);
  const res = spawnSync("node", [`./hooks/${script}`], {
    cwd: AGENTS_DIR,
    input,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(res.status, 0, `${script} failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim());
}

test("hooks.json is valid JSON with expected hooks", () => {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, "hooks.json"), "utf8");
  const parsed = JSON.parse(raw);
  assert.ok(parsed["safety-guard"]?.PreToolUse);
  assert.ok(parsed["prisma-format"]?.PostToolUse);
  assert.ok(parsed["quality-gate"]?.Stop);
});

test("pre-tool-guard: file edit protections", () => {
  const cases = [
    ["allow normal file", "edit_file", "b:\\DEV\\aquejugamos\\server\\src\\index.ts", "allow"],
    ["allow .env.example", "edit_file", "b:\\DEV\\aquejugamos\\.env.example", "allow"],
    ["deny .env", "edit_file", "b:\\DEV\\aquejugamos\\server\\.env", "deny"],
    ["deny .env.production.local", "write_file", "b:\\DEV\\aquejugamos\\.env.production.local", "deny"],
    ["deny serviceAccountKey.json", "write_file", "b:\\DEV\\aquejugamos\\serviceAccountKey.json", "deny"],
    ["deny firebase adminsdk json", "write_file", "server/my-firebase-adminsdk-123.json", "deny"],
    ["deny edit_file on migration", "edit_file", "b:\\DEV\\aquejugamos\\server\\prisma\\migrations\\001\\migration.sql", "deny"],
    ["deny write_file on migration", "write_file", "b:\\DEV\\aquejugamos\\server\\prisma\\migrations\\001\\migration.sql", "deny"],
    ["deny relative migration path", "write_file", "prisma/migrations/001/migration.sql", "deny"],
  ];

  for (const [label, tool, filePath, expected] of cases) {
    const out = runHook("pre-tool-guard.mjs", {
      toolCall: { name: tool, args: { Path: filePath } },
    });
    assert.equal(out.decision, expected, label);
  }
});

test("pre-tool-guard: command protections and bypass resistance", () => {
  const cases = [
    ["safe command", "npm run test", "allow"],
    ["git add .env.example only", "git add .env.example", "allow"],
    ["git add normal file + commit mentioning .env", 'git add server/src/env.ts && git commit -m "docs: update .env"', "allow"],
    ["deny git add .env", "git add server/.env", "deny"],
    ["deny git add bypass with .env.example", "git add .env.example .env", "deny"],
    ["deny git add .env.production.local", "git add .env.production.local", "deny"],
    ["deny git add .env with semicolon", "git add .env; git status", "deny"],
    ["deny git -C dir add secret", "git -C server add serviceAccountKey.json", "deny"],
    ["deny rm -fr .git", "rm -fr .git/", "deny"],
    ["deny rm -r -f ./", "rm -r -f ./", "deny"],
    ["deny Remove-Item .git -Recurse", "Remove-Item .git -Recurse -Force", "deny"],
    ["deny rd /s /q .git", "rd /s /q .git", "deny"],
    ["force_ask prisma migrate reset", "npx prisma migrate reset", "force_ask"],
    ["force_ask git push -f;", "git push origin main -f; echo done", "force_ask"],
    ["force_ask git clean --force", "git clean --force -d", "force_ask"],
    ["force_ask git reset --hard", "git reset --hard HEAD~1", "force_ask"],
    ["force_ask TRUNCATE without TABLE", 'psql -c "TRUNCATE users"', "force_ask"],
  ];

  for (const [label, cmd, expected] of cases) {
    const out = runHook("pre-tool-guard.mjs", {
      toolCall: { name: "run_command", args: { CommandLine: cmd } },
    });
    assert.equal(out.decision, expected, label);
  }

  // Malformed/empty stdin fails safe with ask
  assert.equal(runHook("pre-tool-guard.mjs", null, { rawInput: "" }).decision, "ask");
  assert.equal(runHook("pre-tool-guard.mjs", null, { rawInput: "{bad" }).decision, "ask");
});

test("post-prisma-format: ignores non-prisma files", () => {
  const out = runHook("post-prisma-format.mjs", {
    toolCall: { name: "edit_file", args: { Path: "README.md" } },
    workspacePaths: [REPO_ROOT],
  });
  assert.deepEqual(out, {});
});

test("stop-quality-gate: early exits, cross-drive filtering, full-stack review check", () => {
  // continuationActive allows stop
  assert.deepEqual(
    runHook("stop-quality-gate.mjs", {
      terminationReason: "NO_TOOL_CALL",
      continuationActive: true,
      workspacePaths: [REPO_ROOT],
    }),
    {},
  );

  // Non-NO_TOOL_CALL allows stop
  assert.deepEqual(
    runHook("stop-quality-gate.mjs", {
      terminationReason: "USER_CANCELED",
      continuationActive: false,
      workspacePaths: [REPO_ROOT],
    }),
    {},
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hooks-test-"));
  try {
    // External file edit (different drive on Windows or /tmp) is ignored
    const extTranscript = path.join(tmpDir, "external.jsonl");
    fs.writeFileSync(
      extTranscript,
      [
        JSON.stringify({ type: "USER_INPUT", source: "USER_EXPLICIT" }),
        JSON.stringify({
          type: "PLANNER_RESPONSE",
          tool_calls: [{ name: "write_file", args: { Path: JSON.stringify(path.join(tmpDir, "notes.md")) } }],
        }),
      ].join("\n") + "\n",
    );
    assert.deepEqual(
      runHook("stop-quality-gate.mjs", {
        terminationReason: "NO_TOOL_CALL",
        continuationActive: false,
        workspacePaths: [REPO_ROOT],
        transcriptPath: extTranscript,
      }),
      {},
    );

    // Full-stack edit with ONLY frontend-ui-reviewer should still ask for full-stack review
    const fullStackTranscript = path.join(tmpDir, "fullstack.jsonl");
    fs.writeFileSync(
      fullStackTranscript,
      [
        JSON.stringify({ type: "USER_INPUT", source: "USER_EXPLICIT" }),
        JSON.stringify({
          type: "PLANNER_RESPONSE",
          tool_calls: [
            { name: "edit_file", args: { Path: JSON.stringify(path.join(REPO_ROOT, "client", "src", "App.tsx")) } },
            { name: "edit_file", args: { Path: JSON.stringify(path.join(REPO_ROOT, "server", "src", "index.ts")) } },
          ],
        }),
        JSON.stringify({
          type: "PLANNER_RESPONSE",
          tool_calls: [{ name: "invoke_subagent", args: { TypeName: JSON.stringify("frontend-ui-reviewer") } }],
        }),
      ].join("\n") + "\n",
    );
    const fullStackOut = runHook("stop-quality-gate.mjs", {
      terminationReason: "NO_TOOL_CALL",
      continuationActive: false,
      workspacePaths: [REPO_ROOT],
      transcriptPath: fullStackTranscript,
    });
    assert.equal(fullStackOut.decision, "continue");
    assert.match(fullStackOut.reason, /full-stack/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
