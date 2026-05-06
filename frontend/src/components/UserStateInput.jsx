import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { TrendingUp, Eye, LineChart, DollarSign, Info, ChevronDown } from 'lucide-react';

const MODE_CONFIG = {
  inversion: {
    id: 'inversion',
    label: 'Inversión',
    Icon: TrendingUp,
    description: 'Largo plazo · señales basadas en EMA, zonas y P&L del portfolio',
    color: 'text-blue-400',
    activeBg: 'bg-blue-500/15 border-blue-500/40',
    dot: 'bg-blue-400'
  },
  trading: {
    id: 'trading',
    label: 'Trading',
    Icon: LineChart,
    description: 'Corto plazo · RSI, stop loss ajustado, entradas y salidas tácticas',
    color: 'text-purple-400',
    activeBg: 'bg-purple-500/15 border-purple-500/40',
    dot: 'bg-purple-400'
  },
  observacion: {
    id: 'observacion',
    label: 'Observación',
    Icon: Eye,
    description: 'Solo monitorear · sin señales de operación activas',
    color: 'text-slate-400',
    activeBg: 'bg-slate-500/15 border-slate-500/40',
    dot: 'bg-slate-400'
  }
};

export function UserStateInput({ onSubmit, initialCash = 50, initialMode = 'inversion', initialCapital = 0 }) {
  const [cashPercent, setCashPercent] = useState(initialCash);
  const [mode, setMode] = useState(initialMode);
  const [totalCapital, setTotalCapital] = useState(initialCapital);
  const [capitalInput, setCapitalInput] = useState(initialCapital > 0 ? String(initialCapital) : '');
  const [showModeInfo, setShowModeInfo] = useState(false);

  const cashAmount = totalCapital > 0 ? (totalCapital * cashPercent / 100) : null;
  const activeMode = MODE_CONFIG[mode];

  const cashLevel = cashPercent < 30 ? 'bajo' : cashPercent < 60 ? 'moderado' : 'alto';
  const cashColor = { bajo: 'text-red-400', moderado: 'text-amber-400', alto: 'text-emerald-400' }[cashLevel];

  const handleCapitalChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setCapitalInput(raw);
    setTotalCapital(isNaN(parseFloat(raw)) ? 0 : parseFloat(raw));
  };

  return (
    <div className="space-y-6">
      {/* Capital input */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-widest">
          <DollarSign className="w-3.5 h-3.5" />
          Capital total disponible (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={capitalInput}
            onChange={handleCapitalChange}
            placeholder="Ej: 5000"
            className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl pl-8 pr-4 py-3 text-white
                       focus:outline-none focus:border-blue-500/60 focus:bg-slate-800
                       placeholder-slate-600 transition-colors"
          />
        </div>
        {totalCapital > 0 && (
          <p className="text-xs text-slate-600">
            Capital registrado: <span className="text-slate-400 tabular font-medium">${totalCapital.toLocaleString('en-US')}</span>
          </p>
        )}
      </div>

      {/* Cash slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 uppercase tracking-widest">% en efectivo disponible</span>
          <div className="text-right">
            <span className={`text-2xl font-bold tabular ${cashColor}`}>{cashPercent}%</span>
            {cashAmount !== null && (
              <p className="text-xs text-blue-400 tabular">≈ ${cashAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            )}
          </div>
        </div>

        <input
          type="range"
          min="0" max="100" step="5"
          value={cashPercent}
          onChange={e => setCashPercent(parseInt(e.target.value))}
          className="w-full"
        />

        {/* Cash level indicator */}
        <div className="flex rounded-lg overflow-hidden border border-white/[0.05] text-xs">
          {[
            { label: '0–29% · Bajo',    range: [0, 29],  color: cashPercent < 30 ? 'bg-red-500/20 text-red-400' : 'bg-slate-800/40 text-slate-600' },
            { label: '30–59% · Medio',  range: [30, 59], color: cashPercent >= 30 && cashPercent < 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/40 text-slate-600' },
            { label: '60–100% · Alto',  range: [60, 100],color: cashPercent >= 60 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/40 text-slate-600' }
          ].map((s, i) => (
            <div key={i} className={`flex-1 text-center py-1.5 transition-colors ${s.color}`}>{s.label}</div>
          ))}
        </div>
      </div>

      {/* Mode selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 uppercase tracking-widest">Modo de operación</span>
          <button
            onClick={() => setShowModeInfo(!showModeInfo)}
            className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showModeInfo ? 'Ocultar' : '¿Qué es?'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Object.values(MODE_CONFIG).map(m => (
            <motion.button
              key={m.id}
              onClick={() => setMode(m.id)}
              whileTap={{ scale: 0.97 }}
              className={`
                flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center
                ${mode === m.id
                  ? `${m.activeBg} ${m.color}`
                  : 'bg-slate-800/50 border-white/[0.06] text-slate-500 hover:border-white/[0.12] hover:text-slate-400'}
              `}
            >
              <m.Icon className="w-4 h-4" />
              <span className="text-xs font-semibold leading-tight">{m.label}</span>
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {showModeInfo && activeMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2.5 bg-slate-800/40 border border-white/[0.05] rounded-xl p-3">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activeMode.dot}`} />
                <p className="text-xs text-slate-400 leading-relaxed">{activeMode.description}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Button onClick={() => onSubmit({ cashPercent, mode, totalCapital })} className="w-full py-3">
        Obtener Señal de Inversión
      </Button>
    </div>
  );
}

export default UserStateInput;
