# Setup de OneSignal — web push + email

Pulse usa OneSignal para todas las notificaciones fuera de la app (push del navegador, email transaccional, SMS si lo activas).

Tiempo total: **~10 minutos**.

## 1. Crear cuenta + app

1. Abre <https://onesignal.com> → **Sign Up** (Google o email).
2. En el dashboard → **+ New App/Website**.
3. Nombre: `Pulse`.
4. Selecciona **Web** como plataforma principal.
5. Site setup:
   - **Site name**: Pulse
   - **Site URL**: `http://localhost:5173` (dev). Cuando deployemos production agregamos otra URL.
   - ⚠️ Marca **My site is not fully HTTPS** sólo si vas a probar en localhost (lo activa con label de subdominio).
   - **Default notification icon**: opcional, sube tu logo o deja default.
   - **Permission prompt**: deja el **slidedown** (Pulse lo dispara cuando el usuario hace click en el botón).
6. **Finish**.

## 2. Obtener las credenciales

1. En tu app de OneSignal → sidebar **Settings → Keys & IDs**.
2. Copia:
   - **OneSignal App ID** (formato UUID `xxxxxxxx-xxxx-...`)
   - **REST API Key** (formato `os_v2_app_...`)

## 3. Pasar a Pulse

Pégalas en `docs/onesignal.txt` (gitignored):

```
ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONESIGNAL_API_KEY=os_v2_app_xxxxxxxx...
```

Yo las muevo a `.env`, reinicio el server y el botón **Activar push** del topbar empieza a funcionar.

## 4. Cómo funciona

```
Pulse propone una recomendación crítica
   │
Backend persiste Notification (in-app)
   │
   ▼
¿OneSignal configurado?  ── no ──▶ sólo in-app feed
   │ sí
   ▼
Resuelve canales por preferencia del usuario
   │ (default: push para LOW/MEDIUM, push+email para HIGH/CRITICAL)
   ▼
POST a https://onesignal.com/api/v1/notifications
   │
   ▼
OneSignal entrega:
   • web push → al browser del usuario (incluso con la pestaña cerrada)
   • email → si está en los canales preferidos
   • mobile push → cuando lancemos app
```

## 5. Identidad cross-channel

Cada usuario en Pulse tiene un `oneSignalExternalId` (= su user ID interno). Cuando el browser activa push:

1. Frontend llama `OneSignal.login(user.id)` → asocia este browser con ese usuario
2. Frontend hace POST `/v1/me/onesignal` → guarda el externalId en DB
3. El backend ahora puede direccionar `{ externalUserIds: [user.id] }` y OneSignal entrega por todos los canales suscritos

Si el mismo usuario abre Pulse en Chrome móvil + desktop + agrega su email a la app, las 3 suscripciones quedan vinculadas al mismo external ID y reciben la misma notificación.

## 6. Preferencias por categoría

El usuario puede afinar qué categorías generan qué canal:

```ts
POST /v1/me/preferences
{
  "category": "recommendation",
  "channels": ["IN_APP", "PUSH", "EMAIL"]
}
```

Categorías: `alert`, `recommendation`, `report`, `system`.

Default (sin preferencia explícita):
- LOW/MEDIUM severity → `PUSH`
- HIGH/CRITICAL severity → `PUSH + EMAIL`

## 7. Troubleshooting

**El botón dice "Notificaciones off" siempre**
Verifica que `ONESIGNAL_APP_ID` y `ONESIGNAL_API_KEY` estén en `apps/api/.env` (no sólo en la raíz). Reinicia el server.

**El browser no muestra el prompt**
- Localhost necesita `allowLocalhostAsSecureOrigin: true` (ya lo configuramos).
- Si ya negaste permisos, el browser no vuelve a preguntar — debes ir a site settings y resetear permissions.

**OneSignal SDK no carga**
Revisa la consola del browser. Lo más común: bloqueador de scripts o adblocker bloqueando `cdn.onesignal.com`.

**No llega push aunque el subscriber existe**
- Confirma que el user tiene `oneSignalExternalId` (ver `/v1/me` desde el browser).
- Verifica en el dashboard de OneSignal → **Audience → All Users** que aparezca tu external_user_id.

## 8. Producción

Antes de salir a prod:
- Agrega tu dominio real (`https://pulse.tu-dominio.com`) en **Settings → Web Push → Site URL**.
- Configura **HTTPS** (obligatorio para web push).
- Sube un ícono propio en **Settings → Web Push → Default notification icon**.
- Considera activar **Email** como plataforma (paid plan o conecta tu SendGrid).
