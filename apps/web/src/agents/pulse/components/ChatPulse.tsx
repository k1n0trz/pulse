import { useMemo, useState } from "react";
import { Bot, Send } from "lucide-react";
import { handlePulseCommand } from "../chat/pulseChat";
import type { OperationMode, PulseRecommendation } from "@pulse/shared";

const examples = ["Escala la campana ganadora", "Pausa lo que este perdiendo dinero", "Optimiza todo", "Que esta fallando?", "Crea variaciones de copy", "Audita mi cuenta"];

export function ChatPulse({ mode, recommendations }: { mode: OperationMode; recommendations: PulseRecommendation[] }) {
  const [command, setCommand] = useState("Optimiza todo");
  const response = useMemo(() => handlePulseCommand(command, mode, recommendations), [command, mode, recommendations]);

  return (
    <section className="single-view chat-view">
      <div className="panel chat-panel">
        <div className="chat-header">
          <div className="brand-mark small"><Bot size={20} /></div>
          <div>
            <h2>Chat Pulse</h2>
            <p>Comandos operativos con control por modo.</p>
          </div>
        </div>

        <div className="chat-bubbles">
          <div className="bubble user">{command}</div>
          <div className="bubble pulse">
            <strong>{response.intent}</strong>
            <p>{response.text}</p>
            {response.matchedRecommendations.map((item) => <span key={item.id}>{item.title}</span>)}
          </div>
        </div>

        <div className="prompt-row">
          <input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Comando para Pulse" />
          <button><Send size={18} /></button>
        </div>

        <div className="quick-prompts">
          {examples.map((example) => <button key={example} onClick={() => setCommand(example)}>{example}</button>)}
        </div>
      </div>
    </section>
  );
}
