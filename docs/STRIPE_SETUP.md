# Setup de Stripe — billing

Activa el cobro real. Sin estas keys, los endpoints de billing responden `stripe_not_configured` y el resto de Pulse funciona normal.

Tiempo: ~15 min (+ KYC de Stripe que puede tardar).

## 1. Crear cuenta + productos

1. Crea cuenta en <https://stripe.com> y completa el onboarding básico.
2. **Empieza en modo Test** (toggle arriba a la derecha) para probar sin dinero real.
3. Ve a **Catálogo de productos → Add product** y crea 3 productos con precio recurrente mensual:
   - **Pulse Solo** — $49 USD / mes
   - **Pulse Agency** — $199 USD / mes
   - **Pulse Scale** — $499 USD / mes
4. Copia el **Price ID** de cada uno (formato `price_...`).

## 2. Obtener las keys

1. **Developers → API keys**: copia la **Secret key** (`sk_test_...`).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://TU-API/v1/billing/webhook` (en local usa el Stripe CLI, ver abajo)
   - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`
   - Copia el **Signing secret** (`whsec_...`).

## 3. Pasar a Pulse

Pega en `docs/stripe.txt`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_AGENCY=price_...
STRIPE_PRICE_SCALE=price_...
```

## 4. Probar el webhook en local (Stripe CLI)

```bash
stripe login
stripe listen --forward-to http://localhost:4000/v1/billing/webhook
# copia el whsec_ que imprime → ese es tu STRIPE_WEBHOOK_SECRET en local
stripe trigger checkout.session.completed
```

## 5. Flujo en producción

```
Usuario (ADMIN) → POST /v1/billing/checkout { tier: "AGENCY" }
   │
Backend crea Checkout Session (trial 14 días) → devuelve url
   │
Usuario paga en Stripe Checkout
   │
Stripe → POST /v1/billing/webhook (checkout.session.completed + subscription.created)
   │
Backend actualiza Organization: plan, subscriptionStatus, trialEndsAt, currentPeriodEnd
   │
Gestión posterior → POST /v1/billing/portal → Stripe Billing Portal (cambiar plan, tarjeta, cancelar)
```

## Endpoints

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| GET | `/v1/billing/config` | cualquiera | Catálogo de planes + si Stripe está configurado |
| GET | `/v1/billing/status` | VIEWER | Estado de suscripción del org |
| POST | `/v1/billing/checkout` | ADMIN | Crea checkout session para un tier |
| POST | `/v1/billing/portal` | ADMIN | Abre el billing portal |
| POST | `/v1/billing/webhook` | Stripe | Procesa eventos (raw body verificado) |

## Planes y límites (código fuente: `apps/api/src/lib/plans.ts`)

| Tier | Precio | Cuentas | Usuarios | Autopilot | White-label | API |
|---|---|---|---|---|---|---|
| Free/Trial | $0 | 1 | 1 | — | — | — |
| Solo | $49 | 1 | 1 | — | ✓ | — |
| Agency | $199 | 10 | 5 | ✓ | ✓ | — |
| Scale | $499 | ∞ | ∞ | ✓ | ✓ | ✓ |

Ajusta números/límites en `plans.ts` y los Price IDs en `.env`.
