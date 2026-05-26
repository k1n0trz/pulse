# Setup de Meta — guía paso a paso

Esta es la única parte de Fase 1 que necesita acción humana. Tiempo total: **~20 minutos**.

Al final tendrás los tres valores que Pulse necesita en `.env`:

```env
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=http://localhost:4000/v1/meta/oauth/callback
```

---

## 1. Asegurar el Business Portfolio (Negocio)

Si ya tienes uno listo, salta al paso 2.

1. Abre <https://business.facebook.com/>.
2. Crear cuenta de empresa → llena nombre del negocio, tu nombre y email.
3. Verifica el email.
4. En **Configuración del negocio → Cuentas → Cuentas publicitarias**, asegúrate de tener acceso a la cuenta de Ads que quieres gestionar con Pulse (la tuya o la del cliente). Si no, agrégala o pídela.

## 2. Crear el App en Meta Developers

1. Abre <https://developers.facebook.com/apps/>.
2. Click **Crear app**.
3. Selecciona tipo: **Empresa** (Business).
4. Nombre del app: `Pulse` (o el nombre comercial final). Email de contacto: el tuyo.
5. **Asocia el Business Portfolio** que verificaste en el paso 1.
6. Click **Crear app**. Meta te pedirá tu contraseña.

## 3. Activar el producto Marketing API

1. En el panel del app, sidebar izquierda → **Agregar producto**.
2. Busca **Marketing API** → click **Configurar**.
3. En **Marketing API → Tools**, generarás credenciales más adelante; primero vamos por OAuth.

## 4. Configurar Facebook Login (OAuth)

1. Sidebar → **Agregar producto** → **Facebook Login for Business** → **Configurar**.
2. En **Configuración → Configuración**:
   - **OAuth de cliente** → activo.
   - **Inicio de sesión con OAuth para web** → activo.
   - **URI de redirección OAuth válidos** → agrega:
     ```
     http://localhost:4000/v1/meta/oauth/callback
     ```
     (más adelante agregaremos la URL de producción cuando despleguemos)
3. Guardar.

## 5. Obtener App ID y App Secret

1. Sidebar → **Configuración → Básica**.
2. Copia **ID del app** → guárdalo como `META_APP_ID`.
3. Click **Mostrar** junto a **Clave secreta del app** → te pedirá tu contraseña → copia el valor → guárdalo como `META_APP_SECRET`.
4. **No lo subas a Git nunca.** Va sólo a `.env` local y a variables de entorno del hosting.

## 6. Permisos (scopes) que Pulse pedirá

Por defecto Pulse solicita estos cuatro scopes:

| Scope | Para qué |
|---|---|
| `ads_read` | Leer campañas, ad sets, anuncios e insights |
| `ads_management` | Pausar/reanudar campañas, ajustar presupuestos, rotar creatividades |
| `business_management` | Listar las cuentas publicitarias del Business Portfolio |
| `pages_show_list` | Listar páginas vinculadas (para crear anuncios) |

En **App Review → Permisos y características**, todos están **disponibles en modo desarrollo** sin revisión cuando el app está en modo "Development". Para sacarlo a producción y que otros usuarios puedan conectar sus cuentas, deberás solicitar **Advanced Access** para cada uno — Pulse te ayuda con el formulario en Fase 5.

> Mientras el app esté en modo **Development**, sólo los usuarios listados como **Admins / Developers / Testers** en el panel del app podrán autorizar. Para probar tú: ya estás listado por defecto al ser el creador.

## 7. (Opcional, recomendado) Crear un Test Ad Account

1. <https://business.facebook.com/> → Configuración → Cuentas → **Cuentas publicitarias** → **Agregar** → **Crear una cuenta de prueba**.
2. Te da una cuenta sandbox con presupuesto ficticio. Perfecta para probar Pulse sin gastar dinero real.

## 8. Llenar `.env`

En la raíz del repo (`pulse/`):

```bash
cp .env.example .env
```

Edita `.env`:

```env
DATABASE_URL=postgresql://...   # tu Neon/Supabase
META_APP_ID=<paso 5>
META_APP_SECRET=<paso 5>
META_REDIRECT_URI=http://localhost:4000/v1/meta/oauth/callback

# Genera con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64 hex chars>
```

## 9. Conectar desde Pulse

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Abre <http://localhost:5173> → en el dashboard verás el panel **Meta connection** → click **Conectar con Meta** → autoriza → Pulse guarda tu token cifrado y empieza a sincronizar.

## Solución de problemas

**"App not active" al autorizar**
Verifica que el app esté en modo Development y tu cuenta esté listada como Admin/Developer/Tester.

**"Invalid OAuth redirect URI"**
La URI de `META_REDIRECT_URI` en `.env` debe coincidir exacta-mente con la registrada en Facebook Login → Configuración. Incluye puerto y `/v1/meta/oauth/callback` al final.

**"meta_not_configured" al hacer click en Conectar**
Las tres variables `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` deben estar definidas en `.env`. Reinicia `pnpm dev` después de editarlas.

**El token expira**
Pulse pide tokens long-lived (~60 días) automáticamente. Cuando se acerquen al vencimiento, Pulse mostrará un aviso para reconectar.
