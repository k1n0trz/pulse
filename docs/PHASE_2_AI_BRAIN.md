# Fase 2 — AI brain

Pulse ahora razona sobre tus datos reales de Meta con Claude Opus 4.7 + tool calling. Reemplaza el matcher por palabras del demo por un agente con guardrails por modo.

## Lo que pasa por debajo

1. El usuario escribe en el chat (UI → `POST /v1/chat`, streaming SSE).
2. El backend abre un loop manual de tool calling con Claude:
   - **System prompt frozen** (cacheado, 1 sólo write por sesión)
   - **Adaptive thinking** (Claude decide cuándo y cuánto pensar)
   - **Effort: high** (calidad sobre costo)
3. Claude ve 7 herramientas que envuelven la lógica interna:
   - `list_campaigns` · lee snapshots de Postgres (sin tocar Meta)
   - `get_campaign_insights` · métricas diarias por campaña
   - `audit_account` · scoring 5-dimensiones
   - `compute_recommendations` · motor de reglas Pulse
   - `detect_anomalies` · z-score sobre baseline 14d
   - `propose_action` · escribe una `Recommendation` en DB
   - `execute_action` · sólo en autopilot, llama Marketing API
4. Cada tool call se audita (`AuditEvent`); cada `propose_action` crea una `Recommendation`; cada `execute_action` crea `Decision` + `ActionLog`.
5. Eventos se emiten en vivo al frontend vía SSE (`text_delta`, `tool_call`, `tool_result`, `stop`).

## Guardrails por modo

| Modo | Tools disponibles | Comportamiento |
|---|---|---|
| `read` | sólo lectura (5) | Analiza, propone en lenguaje natural. Nunca persiste. |
| `assisted` | 7 | Puede `propose_action`. Cada propuesta requiere aprobación humana. |
| `autopilot` | 7 | Puede `execute_action` dentro de policy (presupuesto máximo, max cambios diarios, kill switch). |

Adicionalmente, hard constraints en el system prompt:
- Nunca eliminar entidades.
- Nunca exceder `maxDailyBudgetIncreasePercent` en una sola propuesta.
- Si `policy.killSwitch === true`, se rechaza toda mutación.
- Campañas marcadas `critical` quedan fuera de autopilot cuando `blockedCriticalCampaigns === true`.

## Activarlo localmente

1. Cuenta en <https://console.anthropic.com> (crea workspace + API key).
2. Pega la key en `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
3. `pnpm dev` → abre la sección **Chat Pulse** en la UI.
4. Prueba: *"Audita la cuenta y resume hallazgos en 5 líneas"*.

El chat trae mode picker en el sidebar — empieza en `read` para no mutar nada mientras pruebas.

## Costos esperados

Con prompt caching agresivo:
- ~$0.10-0.30 por conversación moderada (5-8 turnos, varias tool calls).
- El system prompt frozen + tool registry estable caches al primer hit.
- Verificar con `usage.cache_read_input_tokens` en el evento `done`.

Para reducir costos:
- Bajar `effort` a `medium` o `low` en `agent.ts` (ahora en `high`).
- Mover tareas simples (clasificación, resumen) a Haiku 4.5 (constante `MODELS.light`).

## Próximo paso (Fase 3)

- Autenticación multi-tenant (Clerk/Auth.js).
- BullMQ + Redis para syncs programados.
- Vista "Aprobaciones pendientes" en la UI mostrando las `Recommendation` que el agente generó.
- Notificaciones (email/Slack/WhatsApp) cuando se crean recomendaciones críticas.
