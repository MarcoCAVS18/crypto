// Asistente: pantalla completa (pestaña de la barra inferior). Mismo contexto que antes (activo, zona, señal, tu posición).
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { assetName } from '../utils/signalView';
import api from '../services/api';

function buildContext(cryptoData, selectedCrypto, currentDecision, portfolio) {
  const data = cryptoData[selectedCrypto];
  const mm = data?.marketMode;
  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
  return {
    symbol: selectedCrypto,
    price: data?.price,
    marketMode: mm?.mode ?? mm,
    modeScore: mm?.score,
    marketReasons: Array.isArray(mm?.reasons) ? mm.reasons.slice(0, 6) : [],
    zone: data?.zones?.currentZone,
    decision: currentDecision?.action,
    strength: currentDecision?.strength,
    // Con el motivo y la recomendación el asistente puede explicar POR QUÉ el sistema dice lo que dice
    decisionReason: currentDecision?.reason,
    recommendation: currentDecision?.recommendation,
    portfolio: portfolioSummary
  };
}

export function ChatScreen() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const { cryptoData, selectedCrypto, currentDecision, portfolio } = useAppStore();
  const name = assetName(selectedCrypto);
  const suggestions = [`¿En qué zona está ${name}?`, '¿Me conviene comprar ahora?', '¿Qué evento macro se viene?'];

  // al cambiar de activo, la conversación empieza de cero para no mezclar contextos
  useEffect(() => { setMessages([]); }, [selectedCrypto]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (override) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput(''); setLoading(true);
    try {
      const context = buildContext(cryptoData, selectedCrypto, currentDecision, portfolio);
      const { data } = await api.post('/chat', { message: text, history: messages.slice(-12), context });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'No pude conectar. Probá de nuevo en un momento.' }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100svh - 11rem)' }}>
      <div className="flex-1 space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="pt-8 text-center space-y-5">
            <span className="mx-auto w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center"><Sparkles className="w-6 h-6" /></span>
            <div>
              <p className="text-lg font-bold text-ink">Preguntame lo que quieras</p>
              <p className="text-sm text-muted mt-1">Conozco el estado actual de {name}: zona, señal y tu posición.</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              {suggestions.map(s => <button key={s} onClick={() => send(s)} className="px-4 py-3 rounded-full bg-panel border border-line text-sm text-ink hover:bg-panel-2">{s}</button>)}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-[22px] text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-accent text-accent-ink font-medium rounded-br-md' : 'bg-panel border border-line text-ink rounded-bl-md'}`}>{m.content}</div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex"><div className="px-4 py-3.5 rounded-[22px] rounded-bl-md bg-panel border border-line flex gap-1.5">
            {[0, 1, 2].map(i => <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)}
          </div></div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-28 flex items-center gap-2 bg-panel border border-line rounded-full pl-5 pr-2 py-2 shadow-xl shadow-black/50">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Preguntá sobre ${name}…`} className="flex-1 bg-transparent text-ink placeholder:text-faint focus:outline-none min-w-0" />
        <button onClick={() => send()} disabled={!input.trim() || loading} aria-label="Enviar"
          className="w-10 h-10 rounded-full bg-accent text-accent-ink flex items-center justify-center disabled:opacity-30 shrink-0"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

export default ChatScreen;
