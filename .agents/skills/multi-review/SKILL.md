---
name: multi-review
description: >-
  Orquesta una evaluación de código multi-enfoque en paralelo usando los
  subagentes especializados (security-reviewer, backend-db-reviewer y
  frontend-ui-reviewer) y consolida los hallazgos por severidad. Usar en PRs,
  cambios medianos/grandes o cuando se modifiquen auth, Prisma, scoring o
  múltiples capas.
---

# Evaluación Multi-Enfoque en Paralelo

Esta skill coordina múltiples especialistas independientes para auditar un diff
local o un Pull Request de GitHub desde ángulos complementarios, reduciendo
puntos ciegos.

## Paso 1: Determinar el alcance

- **Cambios locales**: ejecutá `git status --short` y `git diff --stat` (y
  `git diff --staged --stat`) para identificar qué áreas se tocaron (`client/`,
  `server/`, `server/prisma/`, `.agents/`, etc.). Recordá que los archivos
  nuevos sin seguimiento (`??` en `git status`) no aparecen en `git diff` y
  deben leerse explícitamente con `read_file`.
- **Pull Request de GitHub**: leé los archivos modificados del PR con
  `pull_request_read` del MCP de GitHub.

## Paso 2: Seleccionar y lanzar revisores en paralelo

Invocá en **un mismo turno** (en paralelo con `invoke_subagent`) únicamente los
especialistas relevantes al alcance:

| Área modificada                             | Subagentes a invocar en paralelo                                     |
| :------------------------------------------ | :------------------------------------------------------------------- |
| Solo `client/`                              | `frontend-ui-reviewer` + `security-reviewer`                         |
| Solo `server/`                              | `backend-db-reviewer` + `security-reviewer`                          |
| Ambos (`client/` + `server/`) o PR completo | `security-reviewer` + `backend-db-reviewer` + `frontend-ui-reviewer` |
| Solo config / scripts / `.agents/`          | `pr-reviewer` (revisión simple)                                      |

En el `Prompt` de cada subagente indicá claramente:

- Los archivos modificados y el `git diff` (si es acotado); en PRs de GitHub,
  incluí los archivos y el diff obtenido con `pull_request_read` en el Paso 1
  (los subagentes tienen `inheritMcp: false` para ahorrar contexto).
- Que NO modifique archivos, que lea solo los rangos de líneas necesarios, y que
  devuelva `[BLOQUEANTE]`, `[SUGERENCIA]` o `[NIT]` (o `APROBADO (sin hallazgos)`
  en 1 línea si no hay problemas).

## Paso 3: Consolidar hallazgos

Cuando todos los subagentes respondan:

1. **Deduplicá** hallazgos repetidos entre especialistas.
2. **Presentá una síntesis unificada** agrupada por severidad:
   - `[BLOQUEANTE]` (con especialista origen, `archivo:línea` y acción)
   - `[SUGERENCIA]`
   - `[NIT]`
3. **Veredicto global**:
   - **CAMBIOS REQUERIDOS** si existe al menos un `[BLOQUEANTE]` en cualquier enfoque.
   - **APROBADO** (o Aprobado con sugerencias) si no hay bloqueantes.

## Paso 4: Cerrar el ciclo

- **En cambios locales**: corregí todos los `[BLOQUEANTE]`, volvé a correr
  typecheck/tests si corresponde y confirmá que quedaron resueltos antes de
  responder al usuario.
- **En PRs de GitHub**: mostrá el reporte consolidado al usuario y consultá
  antes de publicar el review en GitHub (salvo que el usuario ya haya pedido
  publicarlo directamente).
