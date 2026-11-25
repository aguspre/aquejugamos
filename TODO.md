# TODO — Features & Fixes

Backlog de funcionalidades y correcciones pendientes para **¿A qué jugamos?**.

---

## 🐛 Bugs

### 1. Limitar el tamaño de la imagen en la vista detallada
- **Contexto:** En [GameDetailDrawer.tsx](client/src/components/game/GameDetailDrawer.tsx), el banner superior usa `aspect-[16/9] w-full`, lo que en pantallas desktop o imágenes verticales/grandes puede ocupar demasiada altura del drawer y dejar poco espacio visible para los detalles.
- **Tareas:**
  - [x] Definir una altura máxima explícita para el contenedor de la imagen (ej. `max-h-56 sm:max-h-64` o `h-48 sm:h-56`) manteniendo `object-cover` (o `object-contain` con fondo desenfocado/sutil si conviene no recortar portadas cuadradas/verticales).
  - [ ] Verificar que el botón de cierre, el badge de rating BGG y el tag de expansión sigan bien posicionados en mobile (bottom sheet) y desktop (side drawer).
  - [ ] Revisar si existe otra vista detallada (ej. tarjetas en [SessionRoomPage.tsx](client/src/pages/SessionRoomPage.tsx) o [HistoryPage.tsx](client/src/pages/HistoryPage.tsx)) con el mismo problema.

---

## ✨ Features

### 2. Idioma de la copia del juego (`UserGame`)
- **Contexto:** Por defecto BGG devuelve el nombre principal (`primary`) y metadatos en inglés (`Game.name`), pero la copia física de un usuario puede estar en español u otro idioma (incluso con título localizado diferente, o edición independiente del idioma del texto en cartas/reglas).
- **Tareas:**
  - **Base de datos ([schema.prisma](server/prisma/schema.prisma)):**
    - [ ] Agregar campos en `UserGame` (por copia de usuario, no global en `Game` para no pisar a otros dueños):
      - `language` (ej. `String?` o enum/código ISO como `es`, `en`, `de`, `fr`, `pt`, `language_independent`, etc.).
      - Opcional: `localName` (`String?`) si el usuario quiere mostrar el título en su idioma (o aprovechar `bgg.parser.ts` para traer `alternate` names de BGG cuando corresponda).
    - [ ] Crear migración Prisma (`npm run db:migrate`).
  - **Backend (`server/src/modules/library/` & `bgg/`):**
    - [ ] Exponer `language` (y `localName` si aplica) en los schemas Zod, servicios y respuestas de `library` y `groups` (para ver en qué idioma está cada copia del grupo).
    - [ ] Permitir actualizar el idioma desde `PATCH /library/:gameId` (o endpoint equivalente de `UserGame`).
    - [ ] *(Opcional)* Al importar colección desde BGG, revisar si el XML de `collection` (`version` / `subtype`) trae idioma o nombre de versión para pre-completarlo.
  - **Frontend (`client/`):**
    - [ ] Selector de idioma en [GameDetailDrawer.tsx](client/src/components/game/GameDetailDrawer.tsx) cuando el juego está en la ludoteca del usuario.
    - [ ] Mostrar badge/etiqueta de idioma (ej. `ES`, `EN`, `Indep. del idioma`) en [GameCard.tsx](client/src/components/game/GameCard.tsx), vista de ludoteca grupal y sala de votación (útil para saber si un juego tiene mucha dependencia del idioma).
    - [ ] Filtro opcional por idioma en [FilterChipBar.tsx](client/src/components/ui/FilterChipBar.tsx) / [filterGames.ts](client/src/utils/filterGames.ts).

---

### 3. Modo oscuro (Dark Mode)
- **Contexto:** Los tokens de color están centralizados en [theme.css](client/src/styles/theme.css) usando Tailwind CSS v4 (`@theme`).
- **Tareas:**
  - **Estilos y Tokens ([theme.css](client/src/styles/theme.css)):**
    - [ ] Definir variante `@custom-variant dark (&:where(.dark, .dark *));` (o `prefers-color-scheme` + toggle manual con clase `.dark` en `<html>`).
    - [ ] Definir overrides de variables CSS (`--color-canvas`, `--color-canvas-subtle`, `--color-canvas-deep`, `--color-surface`, `--color-border`, `--color-border-strong`, `--color-ink`, `--color-ink-muted`, `--color-ink-subtle`, sombras y acentos `forest`/`terracotta`/`ochre`/`teal` ajustados para contraste AA en oscuro).
  - **Estado y Persistencia (`client/`):**
    - [ ] Crear hook/contexto de tema (`light` | `dark` | `system`) persistido en `localStorage`.
    - [ ] Script inline mínimo en `client/index.html` antes del bundle para evitar flash de tema claro (FOUC) al cargar.
    - [ ] Agregar toggle de tema en [AppShell.tsx](client/src/components/layout/AppShell.tsx) (navbar/menú de usuario).
  - **Auditoría de componentes:**
    - [ ] Revisar clases hardcodeadas (`bg-white`, `text-black`, `bg-surface/95`, etc.) en páginas, modales, [DesignSystemPreview.tsx](client/src/pages/DesignSystemPreview.tsx) y skeletons para asegurar buen contraste.

---

### 4. Sincronización de logs de partidas (Plays) desde BGG
- **Contexto:** Actualmente `PlayLog` y `PlayLogPlayer` ([schema.prisma](server/prisma/schema.prisma)) almacenan partidas registradas manualmente en la app, y `User` ya tiene `bggUsername` y `lastBggSyncAt`. La idea es sincronizar los plays de BGG para los miembros del grupo (similar a BG Stats) y unificarlos con las estadísticas/historial del grupo.
- **Tareas:**
  - **Base de datos ([schema.prisma](server/prisma/schema.prisma)):**
    - [ ] Agregar `bggPlayId Int? @unique @map("bgg_play_id")` (o clave compuesta por usuario/fuente) y `source` (`app` | `bgg`) en `PlayLog` para deduplicar al re-sincronizar.
    - [ ] Contemplar jugadores de BGG que no tienen cuenta en la app (ej. `guestName String?` en `PlayLogPlayer` haciendo `userId` nullable, o tabla/campo de jugadores externos vinculados por `bggUsername`), más `lastBggPlaysSyncAt DateTime?` en `User`.
    - [ ] Evaluar soporte para plays sin cuenta vinculada o matcheo automático por `User.bggUsername` entre miembros del grupo.
  - **Backend (`server/src/modules/bgg/` & `play-logs/`):**
    - [ ] Implementar en [bgg.client.ts](server/src/modules/bgg/bgg.client.ts) y [bgg.parser.ts](server/src/modules/bgg/bgg.parser.ts) el consumo y parsing de `/xmlapi2/plays?username=<user>&page=<n>` (con paginación y backoff igual que `collection`).
    - [ ] Endpoint de sync de plays (individual para el usuario y/o disparado a nivel grupo para miembros con `bggUsername` configurado), respetando rate limits de BGG y guardando los juegos faltantes en `Game` si hace falta.
    - [ ] Deduplicación inteligente: si dos miembros del grupo loguearon la misma partida en BGG (mismo juego, misma fecha, jugadores coincidentes) o ya existe en la app, evitar duplicados o permitir vincularlos.
    - [ ] Endpoints de estadísticas grupales e individuales (estilo BG Stats: partidas jugadas, win rate, juegos más jugados, rachas, H-index, filtro por rango de fechas/grupo).
  - **Frontend (`client/`):**
    - [ ] Botón/acción de "Sincronizar partidas de BGG" en perfil/grupo e historial ([HistoryPage.tsx](client/src/pages/HistoryPage.tsx)) con estado de progreso y fecha de última sincronización.
    - [ ] Vista o sección de **Estadísticas del grupo** (estilo BG Stats): ranking de jugadores, juegos más jugados, porcentaje de victorias, partidas por mes y badge de origen (`BGG` vs `App`) en cada `PlayLog`.
