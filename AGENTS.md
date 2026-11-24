## Revisión obligatoria de código

- Antes de dar por terminada cualquier tarea que modifique código de producción
  (o antes de crear/auditar un PR), ejecutá una revisión independiente del diff:
  - **Cambios chicos y acotados** (1–2 archivos, bajo riesgo): invocá al
    subagente `pr-reviewer`.
  - **Cambios medianos/grandes, cambios en auth/permisos/Prisma/scoring, cambios
    full-stack (`client/` + `server/`) o auditorías de PR**: activá la skill
    `multi-review` y lanzá en paralelo los revisores especializados que
    correspondan (`security-reviewer`, `backend-db-reviewer`,
    `frontend-ui-reviewer`).
- Si cualquier revisor reporta hallazgos `[BLOQUEANTE]`, corregilos antes de
  responder al usuario y volvé a verificar.
- Incluí un breve resumen del resultado de la revisión (por enfoque cuando sea
  multi-enfoque) en tu respuesta final.
