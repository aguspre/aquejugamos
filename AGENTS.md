## Revisión obligatoria de código

- Antes de dar por terminada una tarea que modifique código en `client/` o
  `server/` (o antes de crear/auditar un PR), ejecutá una revisión
  independiente del diff (cambios solo en docs/`.md` fuera de código están
  exentos):
  - **Cambios chicos/acotados** (incluidos triviales en `client/`/`server/`,
    full-stack chicos <= ~60 líneas sin auth/permisos/Prisma/scoring, o solo
    `.agents/`/config/scripts): invocá a `pr-reviewer`.
  - **Cambios medianos/grandes, auth/permisos/Prisma/scoring o auditorías de
    PR**: lanzá en paralelo en un mismo turno solo los especialistas
    necesarios (sin necesidad de releer `multi-review/SKILL.md` en diffs
    locales):
    - Solo `client/`: `frontend-ui-reviewer` + `security-reviewer`
    - Solo `server/`: `backend-db-reviewer` + `security-reviewer`
    - Ambos (`client/` + `server/`): `security-reviewer` + `backend-db-reviewer` + `frontend-ui-reviewer`
- Pasá en el `Prompt` la lista de archivos modificados (y el `git diff` si es
  corto) para evitar que cada subagente repita búsquedas.
- Si cualquier revisor reporta `[BLOQUEANTE]`, corregilo antes de responder;
  si aplicás una corrección menor post-review, podés re-validar con `pr-reviewer`.
- Incluí un breve resumen del resultado de la revisión en tu respuesta final.
