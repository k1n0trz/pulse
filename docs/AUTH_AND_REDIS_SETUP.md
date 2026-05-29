# Setup de Clerk (auth) + Upstash (Redis) — Fase 3c

Dos servicios opcionales. Sin ellos, Pulse corre en **modo demo single-tenant** (un solo usuario/org, jobs inline). Con ellos, se vuelve multi-tenant real con colas distribuidas.

---

## A. Clerk — autenticación multi-tenant

### Por qué

- Login con Google / email magic link / password
- Organizaciones + roles (owner/admin/analyst/viewer) sin construirlos a mano
- 10,000 usuarios activos/mes gratis

### Pasos (~10 min)

1. Crea cuenta en <https://clerk.com> → **Create application**.
2. Nombre: `Pulse`. Activa los sign-in que quieras (Google + Email recomendados).
3. **Enable Organizations**: Settings → Organizations → Enable. Esto activa el multi-tenant.
4. En **API Keys** copia:
   - **Publishable key** (`pk_test_...` o `pk_live_...`) → frontend
   - **Secret key** (`sk_test_...` o `sk_live_...`) → backend
5. Pega en `docs/clerk.txt`:
   ```
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

### Cómo se integra

- **Backend**: cuando `CLERK_SECRET_KEY` está set, cada request a `/v1/*` debe traer `Authorization: Bearer <clerk-session-token>`. El backend lo verifica, mapea el Clerk user → Pulse User + Membership, y deriva `organizationId` + `role`. Sin token válido → 401.
- **Frontend**: cuando `VITE_CLERK_PUBLISHABLE_KEY` está set, la app envuelve todo en `<ClerkProvider>`, muestra `<SignIn>` si no hay sesión, e inyecta el token en cada llamada API automáticamente.
- **Roles** (Clerk org role → Pulse):
  - `org:owner` → OWNER
  - `org:admin` → ADMIN
  - `org:analyst` → ANALYST (créalo como custom role en Clerk)
  - cualquier otro → VIEWER

### Roles requeridos por acción

| Acción | Rol mínimo |
|---|---|
| Ver campañas, recomendaciones, auditoría | VIEWER |
| Aprobar/rechazar recomendaciones, disparar sync | ANALYST |
| Importar/revocar conexiones de Meta | ADMIN |

### Sin Clerk

Si `CLERK_SECRET_KEY` no está set, el backend usa el **demo user** (`demo@pulse.local`, rol OWNER) sobre la org `demo`. Es lo que hemos usado todo el desarrollo. Perfecto para single-tenant.

---

## B. Upstash — Redis para BullMQ

### Por qué

- Jobs de sync nocturno/horario con retries, concurrencia y backoff
- Necesario en multi-instancia (varios servidores compartiendo una cola)
- Free tier: 10,000 comandos/día

### Pasos (~5 min)

1. Crea cuenta en <https://upstash.com> → **Create Database** (Redis).
2. Región: la más cercana a donde deployees el API.
3. En la página de la DB, copia la **connection string** (formato `rediss://default:...@...upstash.io:6379`).
4. Pega en `docs/redis.txt`:
   ```
   REDIS_URL=rediss://default:...@...upstash.io:6379
   ENABLE_BULLMQ=true
   ```

### Cómo se integra

- Sin `REDIS_URL` / `ENABLE_BULLMQ=false`: los jobs corren **inline** (síncronos) cuando el cron dispara. Funciona bien para single-node.
- Con Redis + `ENABLE_BULLMQ=true`: el cron encola jobs en BullMQ; un worker los procesa con retry + concurrencia. Listo para escalar horizontal.

No cambia nada del código — sólo el flag de entorno.

---

## Resumen de variables

```env
# Clerk (opcional)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
# y en el frontend:
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Upstash Redis (opcional)
REDIS_URL=rediss://...upstash.io:6379
ENABLE_BULLMQ=true
```

Pásame `docs/clerk.txt` y/o `docs/redis.txt` cuando los tengas y los activo.
