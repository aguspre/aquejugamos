# ¿A qué jugamos?

Un proyecto para organizar juntadas y ludotecas grupales: unir colecciones de juegos de mesa con tus amigos, votar a qué jugar y llevar un registro de las juntadas.

## Stack

| Parte | Tecnología | Carpeta |
| --- | --- | --- |
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 | `client/` |
| Backend | Node.js + Fastify 5 + Prisma 6 | `server/` |
| Base de datos | PostgreSQL 16 (Docker local o Neon) | `docker-compose.yml` |
| Autenticación | Firebase Auth (Google y email/contraseña) + Firebase Admin en el backend | — |
| Datos de juegos | API XML de BoardGameGeek (BGG) | — |
| Deploy | Vercel (frontend + función `client/api/og-preview.js`) | — |

El repo es un **monorepo con npm workspaces**: un solo `npm install` en la raíz instala las dependencias de `client` y `server`.

---

## Guía paso a paso para correrlo localmente

### 1. Requisitos previos

Instalá esto antes de empezar:

- **Git**
- **Node.js 20 o superior** (recomendado 22 LTS) — incluye `npm`. Verificá con `node -v`.
- **Docker Desktop** (o Docker Engine + Docker Compose) para levantar PostgreSQL.
  *Alternativa:* una base PostgreSQL propia o en la nube (por ejemplo [Neon](https://neon.tech)); en ese caso no necesitás Docker.
- **Una cuenta de Google** para crear un proyecto de Firebase (gratis).

### 2. Clonar el repositorio

```bash
git clone <url-del-repo>
cd aquejugamos
```

### 3. Instalar dependencias

Desde la **raíz** del repo (no dentro de `client/` ni `server/`):

```bash
npm install
```

Esto crea un único `node_modules/` en la raíz con todo lo necesario para ambos workspaces.

### 4. Crear los archivos de variables de entorno

Hay tres archivos `.env.example`. Copialos sin el sufijo `.example`:

```bash
cp .env.example .env                # credenciales de Postgres para Docker (opcional: los valores por defecto ya funcionan)
cp server/.env.example server/.env  # configuración del backend
cp client/.env.example client/.env  # configuración del frontend (Firebase web)
```

Los `.env` están en `.gitignore`: nunca se suben al repo.

### 5. Levantar la base de datos

**Opción A — Docker (recomendada):**

```bash
npm run db:up
```

Levanta un contenedor `aquejugamos-postgres` en el puerto `5432` con usuario `aquejugamos`, contraseña `aquejugamos_dev` y base `aquejugamos`. Estos valores ya coinciden con `DATABASE_URL` en `server/.env.example`, así que no hay que tocar nada.

> Si ya tenés otro Postgres usando el puerto 5432, cambiá `POSTGRES_PORT` en `.env` (por ej. `5433`) y actualizá el puerto en `DATABASE_URL` de `server/.env`.

Para apagarla: `npm run db:down` (los datos persisten en un volumen de Docker).

**Opción B — Postgres propio / Neon:** poné tu connection string en `DATABASE_URL` dentro de `server/.env`.

### 6. Crear las tablas y generar el cliente de Prisma

```bash
npm run db:deploy    # aplica las migraciones de server/prisma/migrations
npm run db:generate  # genera el cliente de Prisma
```

Opcional: `npm run db:studio` abre una UI web para ver y editar la base.

### 7. Configurar Firebase (autenticación)

El login usa Firebase Auth y el backend valida los tokens con **Firebase Admin**. Sin esto el servidor arranca, pero cualquier login responde `FIREBASE_NOT_CONFIGURED`.

Como la cuenta de servicio del proyecto original es privada, lo más simple es **crear tu propio proyecto de Firebase**:

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com) y creá un proyecto (Google Analytics no hace falta).
2. **Authentication → Comenzar → Método de acceso** y habilitá **Google** y **Correo electrónico/contraseña**.
   `localhost` ya viene como dominio autorizado (Authentication → Configuración → Dominios autorizados).
3. **Configuración del proyecto (⚙️) → General → Tus apps → Agregar app Web (`</>`)**. Copiá los valores de `firebaseConfig` en `client/.env`:

   ```env
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="tu-proyecto.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="tu-proyecto"
   VITE_FIREBASE_STORAGE_BUCKET="tu-proyecto.firebasestorage.app"
   VITE_FIREBASE_MESSAGING_SENDER_ID="..."
   VITE_FIREBASE_APP_ID="..."
   ```

4. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un JSON.
   Renombralo a `serviceAccountKey.json` y guardalo en **`server/serviceAccountKey.json`** (ya está ignorado por git — **nunca lo subas**).
5. En `server/.env`, poné el ID de tu proyecto:

   ```env
   FIREBASE_SERVICE_ACCOUNT_PATH="./serviceAccountKey.json"
   FIREBASE_PROJECT_ID="tu-proyecto"
   ```

> **Alternativa sin archivo** (útil en CI/producción): dejá `FIREBASE_SERVICE_ACCOUNT_PATH` vacío y completá `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` (con los `\n` escapados) en `server/.env`, copiando esos campos del JSON.

> Si sos colaborador del proyecto original, en lugar de crear uno nuevo pedile al owner acceso al proyecto `aquejugamos-81425` y una clave de cuenta de servicio; en ese caso `client/.env.example` ya trae la configuración web correcta.

### 8. Completar el resto de `server/.env`

- **`JWT_SECRET`**: cambialo por un texto aleatorio de **al menos 16 caracteres** (si es más corto, el servidor no arranca). Podés generar uno con:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- **`BGG_API_TOKEN`**: BoardGameGeek exige registrar una aplicación para usar su API XML. Si la búsqueda o la sincronización de colecciones responde *"BoardGameGeek rechazó la solicitud (401/403)"*, registrá una app en [boardgamegeek.com/applications](https://boardgamegeek.com/applications) y pegá el token acá. El resto de la app funciona sin esto.
- El resto de las variables (`PORT`, `CORS_ORIGIN`, límites de BGG, etc.) tienen valores por defecto que sirven para desarrollo.

### 9. Levantar backend y frontend

En **dos terminales** separadas, desde la raíz:

```bash
# Terminal 1 — API en http://localhost:3001
npm run dev:server
```

```bash
# Terminal 2 — Web en http://localhost:5173
npm run dev:client
```

Vite redirige todas las llamadas a `/api` hacia `http://localhost:3001`, así que no hace falta configurar `VITE_API_BASE_URL` en local.

### 10. Verificar que todo funciona

- `http://localhost:3001/api/health` debería responder un JSON de estado.
- Abrí `http://localhost:5173`, iniciá sesión con Google o email y probá crear un grupo.

---

## Scripts útiles (desde la raíz)

| Comando | Qué hace |
| --- | --- |
| `npm run dev:server` | Backend con recarga automática (`tsx watch`) |
| `npm run dev:client` | Frontend con Vite |
| `npm run build` | Compila server y client |
| `npm run db:up` / `db:down` | Levanta / apaga Postgres en Docker |
| `npm run db:deploy` | Aplica las migraciones existentes |
| `npm run db:migrate` | Crea una migración nueva tras editar `server/prisma/schema.prisma` |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:studio` | UI web para explorar la base |
| `npm test --workspace=server` | Tests del backend (Vitest) |
| `npm run typecheck --workspace=client` | Chequeo de tipos del frontend |

## Problemas frecuentes

| Síntoma | Causa / solución |
| --- | --- |
| `Variables de entorno inválidas: DATABASE_URL es requerida` | Falta `server/.env` (paso 4). |
| `JWT_SECRET debe tener al menos 16 caracteres` | Usá un secreto más largo (paso 8). |
| `Can't reach database server at localhost:5432` | Docker no está corriendo o el contenedor no levantó: `docker ps`, `npm run db:up`. |
| `@prisma/client did not initialize yet` | Corré `npm run db:generate`. |
| Login responde `FIREBASE_NOT_CONFIGURED` | Falta `server/serviceAccountKey.json` o las variables de Firebase Admin (paso 7). |
| Error `auth/unauthorized-domain` en el popup de Google | Agregá tu dominio en Firebase → Authentication → Dominios autorizados. |
| `auth/invalid-api-key` | Los valores de `client/.env` no corresponden a tu proyecto de Firebase. Reiniciá `npm run dev:client` después de editarlo. |
| BGG responde 401/403 | Configurá `BGG_API_TOKEN` (paso 8). |
| Puerto 5432, 3001 o 5173 ocupado | Cambiá `POSTGRES_PORT`, `PORT` (y el `target` del proxy en `client/vite.config.ts`) o cerrá el proceso que lo usa. |

## Notas

- `client/api/og-preview.js` es una función de Vercel que genera las previews de links para WhatsApp/Telegram. Solo corre en Vercel; en local no hace falta.
- `neon.ts` y las dependencias `@neon/*` de la raíz son la configuración del proyecto en Neon (Postgres en la nube) usado en producción. No son necesarias para desarrollo local con Docker.

## Licencia

Ver [LICENSE](LICENSE).
