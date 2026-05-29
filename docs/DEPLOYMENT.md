# Deployment — Pulse a producción

Arquitectura de 3 desplegables + 1 base de datos:

```
                 ┌─────────────────────────┐
   pulseads.app       → Vercel (apps/landing)  [estático, home comercial]
   app.pulseads.app   → Vercel (apps/web)      [SPA, la app]
   api.pulseads.app   → Railway (apps/api)     [Docker, long-running]
                 └───────────────┬─────────────┘
                                 ▼
                       Supabase Postgres (ya existe)
```

- **API** corre en Railway porque es long-running (scheduler, SSE chat).
- **Web** y **Landing** son estáticos → Vercel (CDN, gratis).
- **DB** es la misma Supabase que ya usamos.

---

## 0. Pre-requisitos (tus cuentas)

| Cuenta | Para qué | Costo |
|---|---|---|
| Railway (railway.app) | Hostear el API | ~$5/mo |
| Vercel (vercel.com) | Web + landing | Gratis (hobby) |
| Dominio (Cloudflare/Namecheap) | URLs bonitas | ~$12/año |
| Supabase | DB (ya la tienes) | Gratis |

Las cuentas de Clerk / OneSignal / Stripe / Anthropic / Meta ya las tienes o están documentadas.

---

## 1. API en Railway

1. <https://railway.app> → **New Project → Deploy from GitHub repo** → `k1n0trz/pulse`.
2. Railway detecta el `Dockerfile` y `railway.json` en la raíz. No cambies el builder.
3. En **Variables**, pega todas las del API (ver checklist abajo). **Críticas**: `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`, `META_*`, `ANTHROPIC_API_KEY`, `ONESIGNAL_*`.
4. **Importante para prod**:
   - `NODE_ENV=production`
   - `HOST=0.0.0.0` (ya está en el Dockerfile)
   - `CORS_ORIGINS=https://app.pulseads.app` (el origen de la web)
   - `WEB_APP_URL=https://app.pulseads.app`
   - `META_REDIRECT_URI=https://api.pulseads.app/v1/meta/oauth/callback`
   - `ENABLE_SYNC_SCHEDULER=true` (para que corran los syncs)
5. Deploy. El contenedor corre `prisma migrate deploy && node dist/server.js` — aplica migraciones automáticamente.
6. **Dominio**: Railway → Settings → Networking → genera un dominio o conecta `api.pulseads.app`.
7. Verifica: `https://api.pulseads.app/health` → `{ ok: true }`.

### Redis (opcional, recomendado en prod)
Si quieres jobs en cola en vez de inline: agrega un plugin Redis en Railway (o Upstash), pon `REDIS_URL` + `ENABLE_BULLMQ=true`.

---

## 2. Web en Vercel

1. <https://vercel.com> → **Add New → Project** → importa `k1n0trz/pulse`.
2. **Root Directory**: `apps/web`.
3. Framework: Vite (autodetectado). El `apps/web/vercel.json` ya define install/build commands del monorepo.
4. **Environment Variables**:
   - `VITE_API_BASE_URL=https://api.pulseads.app`
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...` (si usas Clerk; si no, omítela y corre en modo demo)
5. Deploy. Conecta el dominio `app.pulseads.app`.

> El `rewrites` en vercel.json hace fallback de rutas a `index.html` (SPA).

---

## 3. Landing en Vercel

1. Vercel → **Add New → Project** → importa el mismo repo `k1n0trz/pulse` (segundo proyecto).
2. **Root Directory**: `apps/landing`.
3. **Environment Variables**:
   - `VITE_APP_URL=https://app.pulseads.app` (a dónde apuntan los CTAs "Empezar")
4. Deploy. Conecta el dominio raíz `pulseads.app` (la home comercial vive en la raíz).

---

## 4. Conectar todo (después del primer deploy)

1. **Meta App** → Facebook Login → Valid OAuth Redirect URIs: agrega
   `https://api.pulseads.app/v1/meta/oauth/callback`.
2. **OneSignal** → Settings → Web Push → Site URL: agrega `https://app.pulseads.app`.
3. **Clerk** → agrega `https://app.pulseads.app` a allowed origins; usa keys `pk_live_`/`sk_live_`.
4. **Stripe** → Webhook endpoint: `https://api.pulseads.app/v1/billing/webhook`; usa keys live.
5. **CORS**: confirma que `CORS_ORIGINS` en Railway incluye el origen exacto de la web (con https, sin slash final).

---

## 5. Checklist de variables por servicio

### Railway (API)
```
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://...pooler.supabase.com:5432/postgres
ENCRYPTION_KEY=<64 hex>
JWT_SECRET=<48 byte hex>
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://api.pulseads.app/v1/meta/oauth/callback
META_API_VERSION=v23.0
META_DEFAULT_SCOPES=ads_read,ads_management,business_management,pages_show_list
WEB_APP_URL=https://app.pulseads.app
CORS_ORIGINS=https://app.pulseads.app
ANTHROPIC_API_KEY=sk-ant-...
ONESIGNAL_APP_ID=...
ONESIGNAL_API_KEY=...
ENABLE_SYNC_SCHEDULER=true
# Opcionales:
CLERK_SECRET_KEY=sk_live_...
REDIS_URL=rediss://...
ENABLE_BULLMQ=true
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_AGENCY=price_...
STRIPE_PRICE_SCALE=price_...
BILLING_SUCCESS_URL=https://app.pulseads.app/billing/success
BILLING_CANCEL_URL=https://app.pulseads.app/billing/cancel
```

### Vercel — Web
```
VITE_API_BASE_URL=https://api.pulseads.app
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...   (opcional)
```

### Vercel — Landing
```
VITE_APP_URL=https://app.pulseads.app
```

---

## 6. Migraciones de base de datos

El repo ya tiene la migración baseline en `apps/api/prisma/migrations/0_init`. En cada deploy, el contenedor ejecuta `prisma migrate deploy`, que aplica migraciones pendientes sin tocar datos existentes.

**Para cambios de schema futuros:**
```bash
# local, contra una DB de desarrollo
pnpm --filter @pulse/api exec prisma migrate dev --name describe_el_cambio
git add apps/api/prisma/migrations && git commit && git push
# el siguiente deploy en Railway aplica la migración automáticamente
```

---

## 7. Verificación post-deploy

- [ ] `GET https://api.pulseads.app/health` → 200
- [ ] `GET https://api.pulseads.app/health/db` → `{ db: "reachable" }`
- [ ] La web carga en `https://app.pulseads.app`
- [ ] La landing carga en `https://pulseads.app` con CTAs apuntando a la web
- [ ] Conectar Meta funciona (redirect vuelve correctamente)
- [ ] El chat responde (Anthropic configurado)
- [ ] Una notificación push llega (OneSignal)
- [ ] Si Stripe: un checkout de prueba completa el webhook

---

## 8. Notas de seguridad para producción

- Repo en **privado** antes de tener tracción (hoy es público): `gh repo edit k1n0trz/pulse --visibility private --accept-visibility-change-consequences`.
- Rota cualquier credencial que haya estado en texto plano.
- `ENCRYPTION_KEY` y `JWT_SECRET` deben ser distintos a los de desarrollo.
- Activa SSL enforcement en Supabase (Settings → Database).
