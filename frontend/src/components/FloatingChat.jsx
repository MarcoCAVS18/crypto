import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Bot, User } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import api from '../services/api';

function buildContext(cryptoData, selectedCrypto, currentDecision, portfolio) {
  const data = cryptoData[selectedCrypto];
  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
  return {
    symbol:      selectedCrypto,
    price:       data?.price,
    marketMode:  data?.marketMode?.mode ?? data?.marketMode,
    zone:        data?.zones?.currentZone,
    decision:    currentDecision?.action,
    portfolio:   portfolioSummary
  };
}

export function FloatingChat() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const { cryptoData, selectedCrypto, currentDecision, portfolio } = useAppStore();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = buildContext(cryptoData, selectedCrypto, currentDecision, portfolio);
      // Send last 8 messages as history (4 exchanges)
      const history = messages.slice(-8);
      const { data } = await api.post('/chat', { message: text, history, context });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error al conectar. Intentá de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-20 right-4 z-50 w-[min(360px,calc(100vw-2rem))]
                       rounded-2xl border border-white/[0.08] bg-slate-950/95 backdrop-blur-xl
                       shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
            style={{ maxHeight: '70svh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600/80 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Asistente de inversión</p>
                  <p className="text-[10px] text-slate-500">BTC · PAXG · Solo inversiones</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-6 space-y-2">
                  <Bot className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Preguntame sobre BTC o PAXG —<br/>zonas de compra, DCA, contexto macro...
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-blue-600/70 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600/80 text-white rounded-br-sm'
                      : 'bg-white/[0.06] text-slate-200 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  )}
                </motion.div>
              ))}

              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600/70 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="px-3 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.06] flex gap-1 items-center">
                    {[0,1,2].map(i => (
                      <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500"
                        animate={{ opacity: [0.3,1,0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-2 border-t border-white/[0.05] shrink-0">
              <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl border border-white/[0.07] px-3 py-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="¿En qué zona está BTC?"
                  className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="w-7 h-7 rounded-lg bg-blue-600/80 hover:bg-blue-600 flex items-center justify-center
                             transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        whileTap={{ scale: 0.93 }}
        className="fixed bottom-5 right-4 z-50 w-13 h-13 rounded-full bg-blue-600 hover:bg-blue-500
                   shadow-lg shadow-blue-900/40 flex items-center justify-center transition-colors"
        style={{ marginBottom: 'env(safe-area-inset-bottom)', width: 52, height: 52 }}
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X className="w-5 h-5 text-white" />
              </motion.span>
            : <motion.span key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <MessageCircle className="w-5 h-5 text-white" />
              </motion.span>
          }
        </AnimatePresence>
      </motion.button>
    </>
  );
}

export default FloatingChat;
