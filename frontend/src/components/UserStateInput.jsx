import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { TrendingUp, Eye, DollarSign, Info } from 'lucide-react';
import { sanitizeDecimal } from '../utils/decimalInput';

const MODE_CONFIG = {
  inversion: {
    id: 'inversion',
    label: 'Acumulando',
    Icon: TrendingUp,
    description: 'Señales de acumulación progresiva basadas en zonas, EMA y P&L del portfolio.',
    color: 'text-blue-400',
    activeBg: 'bg-blue-500/15 border-blue-500/40',
    dot: 'bg-blue-400'
  },
  observacion: {
    id: 'observacion',
    label: 'Observando',
    Icon: Eye,
    description: 'Solo monitorear el mercado sin señales de entrada activas.',
    color: 'text-slate-400',
    activeBg: 'bg-slate-500/15 border-slate-500/40',
    dot: 'bg-slate-400'
  }
};

export function UserStateInput({ onSubmit, initialCash = 50, initialMode = 'inversion', initialCapital = 0, initialTarget = '', initialFee = '', symbol = 'PAXG' }) {
  const isGold = symbol === 'PAXG';
  const [cashPercent, setCashPercent] = useState(initialCash);
  const [mode, setMode] = useState(initialMode);
  const [totalCapital, setTotalCapital] = useState(initialCapital);
  const [capitalInput, setCapitalInput] = useState(initialCapital > 0 ? String(initialCapital) : '');
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [targetInput, setTargetInput] = useState(initialTarget === null || initialTarget === undefined ? '' : String(initialTarget));
  const [feeInput, setFeeInput] = useState(initialFee === null || initialFee === undefined ? '' : String(initialFee));

  const cashAmount = totalCapital > 0 ? (totalCapital * cashPercent / 100) : null;
  const activeMode = MODE_CONFIG[mode];

  const cashLevel = cashPercent < 30 ? 'bajo' : cashPercent < 60 ? 'moderado' : 'alto';
  const cashColor = { bajo: 'text-red-400', moderado: 'text-amber-400', alto: 'text-emerald-400' }[cashLevel];

  const handleCapitalChange = (e) => {
    const raw = sanitizeDecimal(e.target.value);
    setCapitalInput(raw);
    setTotalCapital(isNaN(parseFloat(raw)) ? 0 : parseFloat(raw));
  };

  return (
    <div className="space-y-6">
      {/* Capital input */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-widest">
          <DollarSign className="w-3.5 h-3.5" />
          Capital total (USD)
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
        <p className="text-[11px] text-slate-600">
          Con 100 % de efectivo se entiende que este monto es solo el efectivo que querés invertir: el peso de tus posiciones se calcula aparte con lo que tenés en el Portfolio. Con menos de 100 %, cargá todo lo que tenés (efectivo + inversiones).
        </p>
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

        <div className="grid grid-cols-2 gap-2">
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

      {/* Ajustes opcionales: costo de operar (todos los activos) y peso objetivo (solo el oro: es el único con política de portafolio) */}
      <div className={`grid gap-3 ${isGold ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {isGold && (
        <label className="space-y-1.5">
          <span className="block text-[11px] text-slate-500 uppercase tracking-widest">Peso objetivo del oro (%)</span>
          <input
            type="text" inputMode="decimal" value={targetInput} placeholder="Sin objetivo"
            onChange={e => setTargetInput(sanitizeDecimal(e.target.value))}
            className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
          />
        </label>
        )}
        <label className="space-y-1.5">
          <span className="block text-[11px] text-slate-500 uppercase tracking-widest">Comisión por orden (%)</span>
          <input
            type="text" inputMode="decimal" value={feeInput} placeholder="0.1 (Binance spot)"
            onChange={e => setFeeInput(sanitizeDecimal(e.target.value))}
            className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-600 -mt-3">
        {isGold && 'Con objetivo, el motor frena las compras si el oro pasa la banda (±5 pts) y acelera el DCA si está por debajo. '}La comisión (Binance spot: 0.1 %, 0.075 % pagando con BNB) se usa para estimar costos y descartar tramos ínfimos.
      </p>

      <Button onClick={() => {
        const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
        onSubmit({
          cashPercent, mode, totalCapital,
          // el peso objetivo solo se edita con el oro; en otros activos se conserva el valor del perfil
          targetPercent: isGold ? num(targetInput) : num(initialTarget),
          feePercent:    num(feeInput)
        });
      }} className="w-full py-3">
        Actualizar señal
      </Button>
    </div>
  );
}

export default UserStateInput;
