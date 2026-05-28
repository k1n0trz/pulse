import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, Wrench, AlertCircle, CheckCircle2 } from "lucide-react";
import type { OperationMode } from "@pulse/shared";
import { streamChat, type AgentStreamEvent, api } from "../../../lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolEvents: Array<{ name: string; ok: boolean; recommendationId?: string }>;
}

const examples = [
  "¿Cómo va la cuenta hoy?",
  "Audita la cuenta y resume los hallazgos",
  "Detecta anomalías de los últimos 14 días",
  "Propón las 3 mejores optimizaciones ahora mismo",
  "Lista las campañas con CPA por encima del objetivo",
  "Escala la ganadora con ROAS > 4"
];

export function ChatPulse({ mode }: { mode: OperationMode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.ai.config().then((c) => setConfigured(c.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    const next: ChatMessage = { role: "user", content: text, toolEvents: [] };
    const assistant: ChatMessage = { role: "assistant", content: "", toolEvents: [] };
    setMessages((prev) => [...prev, next, assistant]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const conversation = [...messages, next].map(({ role, content }) => ({ role, content }));

    const updateAssistant = (mut: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = mut(copy[copy.length - 1]!);
        return copy;
      });
    };

    try {
      await streamChat(
        { mode, messages: conversation },
        (event: AgentStreamEvent) => {
          if (event.type === "text_delta") {
            updateAssistant((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "tool_call") {
            updateAssistant((m) => ({ ...m, toolEvents: [...m.toolEvents, { name: event.name, ok: false }] }));
          } else if (event.type === "tool_result") {
            updateAssistant((m) => {
              const events = [...m.toolEvents];
              const idx = events.findIndex((e) => e.name === event.name && !e.ok);
              if (idx >= 0) events[idx] = { ...events[idx]!, ok: event.ok, recommendationId: event.recommendationId };
              return { ...m, toolEvents: events };
            });
          } else if (event.type === "error") {
            setError(event.message);
          }
        },
        controller.signal
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [mode, messages, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return (
    <section className="single-view chat-view">
      <div className="panel chat-panel">
        <div className="chat-header">
          <div className="brand-mark small"><Bot size={20} /></div>
          <div>
            <h2>Chat Pulse</h2>
            <p>
              {configured === null
                ? "Verificando configuración…"
                : configured
                  ? "Claude Opus 4.7 · tool calling sobre datos reales · modo "
                  : "Falta ANTHROPIC_API_KEY en .env"}
              {configured && <strong>{mode}</strong>}
            </p>
          </div>
        </div>

        {configured === false && (
          <div className="chat-config-warn">
            <AlertCircle size={16} />
            <span>
              Crea cuenta en <code>console.anthropic.com</code>, genera una API key y pégala como <code>ANTHROPIC_API_KEY</code> en <code>.env</code>.
            </span>
          </div>
        )}

        <div className="chat-bubbles" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={20} />
              <p>Pregunta lo que quieras sobre tus campañas. Pulse usa Claude + tus datos reales para responder y proponer acciones.</p>
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={idx} className={`bubble ${m.role}`}>
              {m.toolEvents.length > 0 && (
                <div className="tool-trace">
                  {m.toolEvents.map((evt, i) => (
                    <span key={i} className={`tool-chip ${evt.ok ? "ok" : "pending"}`}>
                      {evt.ok ? <CheckCircle2 size={12} /> : <Wrench size={12} className="spin" />}
                      {evt.name}
                      {evt.recommendationId && <em>· R{evt.recommendationId.slice(-6)}</em>}
                    </span>
                  ))}
                </div>
              )}
              <p className="bubble-content">{m.content || (streaming && idx === messages.length - 1 ? "…" : "")}</p>
            </div>
          ))}
        </div>

        {error && <small className="error-text">{error}</small>}

        <div className="prompt-row">
          <input
            value={input}
            disabled={!configured || streaming}
            placeholder={configured ? "Pregúntale a Pulse…" : "Configura ANTHROPIC_API_KEY para activar el chat"}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            aria-label="Comando para Pulse"
          />
          {streaming ? (
            <button onClick={stop} aria-label="Detener">Stop</button>
          ) : (
            <button onClick={() => void send(input)} disabled={!configured || !input.trim()} aria-label="Enviar">
              <Send size={18} />
            </button>
          )}
        </div>

        <div className="quick-prompts">
          {examples.map((example) => (
            <button key={example} onClick={() => void send(example)} disabled={!configured || streaming}>{example}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
