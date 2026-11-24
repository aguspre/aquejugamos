import fs from "node:fs";
import path from "node:path";

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function respond(obj) {
  fs.writeSync(1, `${JSON.stringify(obj)}\n`);
}

function normalizePath(p) {
  const unix = String(p || "").replace(/\\/g, "/");
  return path.posix.normalize(unix).toLowerCase();
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

function splitShellSubcommands(cmd) {
  const parts = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      current += ch;
      if (ch === quote && cmd[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "\n" || ch === ";") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    if ((ch === "&" && cmd[i + 1] === "&") || (ch === "|" && cmd[i + 1] === "|")) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      i++;
      continue;
    }

    if (ch === "|") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokenizeArgs(segment) {
  const tokens = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = regex.exec(segment)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function checkFileEdit(args) {
  const rawPath = args?.Path ?? args?.path ?? args?.TargetFile ?? "";
  if (!rawPath) return { decision: "allow" };

  const norm = normalizePath(rawPath);
  const base = norm.split("/").pop() || "";

  if (isSensitiveBasename(base)) {
    return {
      decision: "deny",
      reason: `Bloqueado por safety-guard: no se permite modificar archivos sensibles o de credenciales (${base}).`,
    };
  }

  // Block both edit_file and write_file on Prisma migrations (relative or absolute paths)
  if (/(^|\/)prisma\/migrations\//.test(norm)) {
    return {
      decision: "deny",
      reason:
        "Bloqueado por safety-guard: no modifiques ni crees archivos manuales en prisma/migrations/. Usá `npm run db:migrate`.",
    };
  }

  return { decision: "allow" };
}

function checkGitAddSecrets(tokens) {
  if (tokens.length < 2) return null;
  const cmdName = path.basename(tokens[0]).toLowerCase();
  if (cmdName !== "git" && cmdName !== "git.exe") return null;

  // Skip git global options like -C <dir>, -c key=val, --git-dir=...
  let idx = 1;
  while (idx < tokens.length && tokens[idx].startsWith("-")) {
    const flag = tokens[idx];
    idx++;
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(flag) && idx < tokens.length) {
      idx++;
    }
  }

  const subcmd = (tokens[idx] || "").toLowerCase();
  if (subcmd !== "add" && subcmd !== "stage") return null;

  for (let i = idx + 1; i < tokens.length; i++) {
    const arg = tokens[i];
    if (!arg || arg === "--" || arg.startsWith("-")) continue;
    const normArg = arg.replace(/\\/g, "/").replace(/\/+$/, "");
    const base = normArg.split("/").pop() || "";
    if (isSensitiveBasename(base)) {
      return {
        decision: "deny",
        reason: `Bloqueado por safety-guard: intento de agregar un archivo sensible (${arg}) al índice de git.`,
      };
    }
  }

  return null;
}

function checkDestructiveDelete(tokens, segment) {
  if (tokens.length === 0) return null;
  const head = path.basename(tokens[0]).toLowerCase();

  // Unix rm with recursive + force flags in any order
  if (head === "rm" || head === "rm.exe") {
    let hasR = false;
    let hasF = false;
    const targets = [];

    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "--recursive") hasR = true;
      else if (t === "--force") hasF = true;
      else if (/^-[a-zA-Z]+$/.test(t)) {
        if (/[rR]/.test(t)) hasR = true;
        if (/f/.test(t)) hasF = true;
      } else if (t !== "--" && !t.startsWith("-")) {
        targets.push(t.replace(/\\/g, "/").replace(/\/+$/, "") || "/");
      }
    }

    if (hasR && hasF) {
      const dangerousTarget = targets.find((t) =>
        ["/", ".", "..", "~", ".git", "*"].includes(t) || t.endsWith("/.git"),
      );
      if (dangerousTarget) {
        return {
          decision: "deny",
          reason: `Bloqueado por safety-guard: borrado recursivo destructivo sobre '${dangerousTarget}'.`,
        };
      }
    }
  }

  // PowerShell Remove-Item / ri / del / rd / rmdir with recursive delete on dangerous targets
  if (["remove-item", "ri", "rd", "rmdir"].includes(head)) {
    const hasRecurse =
      tokens.some((t) => /^-(recurse|r)$/i.test(t)) ||
      ((head === "rd" || head === "rmdir") && tokens.some((t) => /^\/s$/i.test(t)));

    if (hasRecurse) {
      const targets = tokens
        .slice(1)
        .filter((t) => !t.startsWith("-") && !t.startsWith("/"))
        .map((t) => t.replace(/\\/g, "/").replace(/\/+$/, "") || "/");

      const dangerousTarget = targets.find((t) =>
        ["/", ".", "..", "~", ".git", "*", "./*"].includes(t) ||
        t.endsWith("/.git") ||
        /^[a-z]:$/i.test(t) ||
        /^[a-z]:\/\*$/i.test(t),
      );
      if (dangerousTarget) {
        return {
          decision: "deny",
          reason: `Bloqueado por safety-guard: borrado recursivo destructivo sobre '${dangerousTarget}'.`,
        };
      }
    }
  }

  // Fallback check if raw segment explicitly deletes .git recursively
  if (/\b(Remove-Item|ri|rd|rmdir)\b/i.test(segment) && /(-Recurse|\/s)\b/i.test(segment) && /(^|[\s"'/\\])\.git([/\\"' ]|$)/i.test(segment)) {
    return {
      decision: "deny",
      reason: "Bloqueado por safety-guard: intento de borrar .git recursivamente.",
    };
  }

  return null;
}

function checkCommand(args) {
  const cmd = String(args?.CommandLine ?? args?.command ?? "");
  if (!cmd) return { decision: "allow" };

  const segments = splitShellSubcommands(cmd);

  const dangerousChecks = [
    {
      regex: /\bprisma\s+migrate\s+reset\b/i,
      label: "prisma migrate reset (borra y recrea la base de datos)",
    },
    {
      regex: /\bprisma\s+db\s+push\b.*(--force-reset|--accept-data-loss)(?:[\s;&|)]|$)/i,
      label: "prisma db push con pérdida de datos",
    },
    {
      regex: /\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+push\b.*(?:^|\s)(--force|-f|--force-with-lease|--force-if-includes)(?:[\s;&|)]|$)/i,
      label: "git push forzado",
    },
    {
      regex: /\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+reset\b.*\s--hard(?:[\s;&|)]|$)/i,
      label: "git reset --hard (descarta cambios locales)",
    },
    {
      regex: /\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+clean\b.*(?:^|\s)(-[a-zA-Z]*f[a-zA-Z]*|--force)(?:[\s;&|)]|$)/i,
      label: "git clean forzado (elimina archivos sin seguimiento)",
    },
    {
      regex: /\b(DROP\s+TABLE\b|DROP\s+DATABASE\b|TRUNCATE\s+(?:TABLE\s+)?[a-zA-Z_"][a-zA-Z0-9_."]*)/i,
      label: "sentencia SQL destructiva (DROP/TRUNCATE)",
    },
  ];

  let forceAskResult = null;

  for (const segment of segments) {
    const tokens = tokenizeArgs(segment);

    const secretDeny = checkGitAddSecrets(tokens);
    if (secretDeny) return secretDeny;

    const deleteDeny = checkDestructiveDelete(tokens, segment);
    if (deleteDeny) return deleteDeny;

    if (!forceAskResult) {
      for (const check of dangerousChecks) {
        if (check.regex.test(segment)) {
          forceAskResult = {
            decision: "force_ask",
            reason: `Requiere confirmación explícita por safety-guard: ${check.label}.`,
          };
          break;
        }
      }
    }
  }

  return forceAskResult || { decision: "allow" };
}

const payload = readPayload();
if (!payload) {
  respond({
    decision: "ask",
    reason: "safety-guard no recibió un payload JSON válido; se solicita confirmación.",
  });
} else {
  const toolName = String(payload.toolCall?.name || "").toLowerCase();
  const args = payload.toolCall?.args || {};

  if (toolName === "edit_file" || toolName === "write_file") {
    respond(checkFileEdit(args));
  } else if (toolName === "run_command") {
    respond(checkCommand(args));
  } else {
    respond({ decision: "allow" });
  }
}
