import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, Wrench, AlertCircle, CheckCircle2, Plus, MessageSquare, Trash2, Pencil, Paperclip, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import type { OperationMode } from "@pulse/shared";
import { streamChat, api, type AgentStreamEvent, type ChatAttachment, type ConversationSummary } from "../../../lib/api";

interface AttachmentChip { kind: "image" | "document"; name: string; mediaType: string; data: string }

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolEvents: Array<{ name: string; ok: boolean; recommendationId?: string | null }>;
  attachments?: Array<{ kind: string; name: string | null }>;
}

const examples = [
  "¿Cómo va la cuenta hoy?",
  "Audita la cuenta y resume los hallazgos",
  "Detecta anomalías de los últimos 14 días",
  "Propón las 3 mejores optimizaciones ahora mismo"
];

function fileToAttachment(file: File): Promise<AttachmentChip> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const data = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve({ kind: file.type === "application/pdf" ? "document" : "image", name: file.name, mediaType: file.type || "application/octet-stream", data });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function ChatPulse({ mode }: { mode: OperationMode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AttachmentChip[]>([]);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.conversations.list();
      setConversations(res.conversations);
      return res.conversations;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    api.ai.config().then((c) => setConfigured(c.configured)).catch(() => setConfigured(false));
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const openConversation = useCallback(async (id: string) => {
    setCurrentId(id);
    setError(null);
    try {
      const res = await api.conversations.get(id);
      setMessages(res.messages.map((m) => ({
        role: m.role,
        content: m.content,
        toolEvents: m.toolEvents ?? [],
        attachments: (m.attachments ?? []).map((a) => ({ kind: a.kind, name: a.name }))
      })));
    } catch {
      setMessages([]);
    }
  }, []);

  const newConversation = useCallback(() => {
    setCurrentId(null);
    setMessages([]);
    setInput("");
    setPending([]);
    setError(null);
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    await api.conversations.remove(id).catch(() => {});
    if (id === currentId) newConversation();
    await refreshConversations();
  }, [currentId, newConversation, refreshConversations]);

  const submitRename = useCallback(async (id: string) => {
    const title = renameValue.trim();
    setRenaming(null);
    if (!title) return;
    await api.conversations.rename(id, title).catch(() => {});
    await refreshConversations();
  }, [renameValue, refreshConversations]);

  const pickFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const chips: AttachmentChip[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.size > 10 * 1024 * 1024) { setError(`"${file.name}" supera 10 MB.`); continue; }
      chips.push(await fileToAttachment(file));
    }
    setPending((prev) => [...prev, ...chips].slice(0, 6));
  }, []);

  const send = useCallback(async (text: string) => {
    if ((!text.trim() && pending.length === 0) || streaming) return;
    setError(null);

    // Ensure a conversation exists so the turn is persisted.
    let convId = currentId;
    if (!convId) {
      try {
        const created = await api.conversations.create();
        convId = created.conversation.id;
        setCurrentId(convId);
      } catch {
        convId = null; // fall back to ephemeral chat
      }
    }

    const attachmentsForApi: ChatAttachment[] = pending.map((p) => ({ kind: p.kind, mediaType: p.mediaType, data: p.data, name: p.name }));
    const next: ChatMessage = { role: "user", content: text, toolEvents: [], attachments: pending.map((p) => ({ kind: p.kind, name: p.name })) };
    const assistant: ChatMessage = { role: "assistant", content: "", toolEvents: [] };
    setMessages((prev) => [...prev, next, assistant]);
    setInput("");
    setPending([]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...messages, next].map((m) => ({ role: m.role, content: m.content }));
    // Attach files only to the new (last) user turn.
    const apiMessages = history.map((m, i) => (i === history.length - 1 && attachmentsForApi.length > 0 ? { ...m, attachments: attachmentsForApi } : m));

    const updateAssistant = (mut: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = mut(copy[copy.length - 1]!);
        return copy;
      });
    };

    try {
      await streamChat(
        { mode, messages: apiMessages, conversationId: convId ?? undefined },
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
      void refreshConversations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [mode, messages, streaming, pending, currentId, refreshConversations]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return (
    <section className="single-view chat-view chat-layout">
      <aside className="chat-sidebar">
        <button className="primary-button chat-new" onClick={newConversation}>
          <Plus size={16} /> Nueva conversación
        </button>
        <div className="chat-conv-list">
          {conversations.length === 0 && <p className="chat-conv-empty">Sin conversaciones aún.</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`chat-conv-item ${c.id === currentId ? "active" : ""}`}>
              {renaming === c.id ? (
                <input
                  className="chat-rename"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void submitRename(c.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") void submitRename(c.id); if (e.key === "Escape") setRenaming(null); }}
                />
              ) : (
                <button className="chat-conv-open" onClick={() => void openConversation(c.id)} title={c.title}>
                  <MessageSquare size={14} />
                  <span>{c.title}</span>
                </button>
              )}
              <div className="chat-conv-actions">
                <button title="Renombrar" onClick={() => { setRenaming(c.id); setRenameValue(c.title); }}><Pencil size={13} /></button>
                <button title="Eliminar" onClick={() => void removeConversation(c.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="panel chat-panel">
        <div className="chat-header">
          <div className="brand-mark small"><Bot size={20} /></div>
          <div>
            <h2>Chat Pulse</h2>
            <p>
              {configured === null
                ? "Verificando configuración…"
                : configured
                  ? "Claude Opus 4.7 · tool calling · adjunta imágenes y archivos · modo "
                  : "Falta ANTHROPIC_API_KEY en .env"}
              {configured && <strong>{mode}</strong>}
            </p>
          </div>
        </div>

        {configured === false && (
          <div className="chat-config-warn">
            <AlertCircle size={16} />
            <span>Crea cuenta en <code>console.anthropic.com</code>, genera una API key y pégala como <code>ANTHROPIC_API_KEY</code> en <code>.env</code>.</span>
          </div>
        )}

        <div className="chat-bubbles" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={20} />
              <p>Pregunta lo que quieras sobre tus campañas. Pulse usa Claude + tus datos reales, y ahora también puede leer imágenes y archivos que adjuntes.</p>
            </div>
          )}
          {messages.map((m, idx) => (
            <div key={idx} className={`bubble ${m.role}`}>
              {m.attachments && m.attachments.length > 0 && (
                <div className="bubble-attachments">
                  {m.attachments.map((a, i) => (
                    <span key={i} className="att-chip">{a.kind === "image" ? <ImageIcon size={12} /> : <FileText size={12} />}{a.name ?? a.kind}</span>
                  ))}
                </div>
              )}
              {m.toolEvents.length > 0 && (
                <div className="tool-trace">
                  {m.toolEvents.map((evt, i) => (
                    <span key={i} className={`tool-chip ${evt.ok ? "ok" : "pending"}`}>
                      {evt.ok ? <CheckCircle2 size={12} /> : <Wrench size={12} className="spin" />}
                      {evt.name}
                      {evt.recommendationId && <em>· R{String(evt.recommendationId).slice(-6)}</em>}
                    </span>
                  ))}
                </div>
              )}
              <p className="bubble-content">{m.content || (streaming && idx === messages.length - 1 ? "…" : "")}</p>
            </div>
          ))}
        </div>

        {error && <small className="error-text">{error}</small>}

        {pending.length > 0 && (
          <div className="chat-pending">
            {pending.map((p, i) => (
              <span key={i} className="att-chip">
                {p.kind === "image" ? <ImageIcon size={12} /> : <FileText size={12} />}{p.name}
                <button onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="prompt-row">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
          <button className="chat-attach" disabled={!configured || streaming} title="Adjuntar imagen o archivo" onClick={() => fileRef.current?.click()}>
            <Paperclip size={18} />
          </button>
          <input
            value={input}
            disabled={!configured || streaming}
            placeholder={configured ? "Pregúntale a Pulse…" : "Configura ANTHROPIC_API_KEY para activar el chat"}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
            }}
            aria-label="Comando para Pulse"
          />
          {streaming ? (
            <button onClick={stop} aria-label="Detener"><Loader2 size={16} className="spin" /> Stop</button>
          ) : (
            <button onClick={() => void send(input)} disabled={!configured || (!input.trim() && pending.length === 0)} aria-label="Enviar"><Send size={18} /></button>
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
