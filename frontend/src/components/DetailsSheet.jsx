// Bottom sheet con detalles técnicos + tu posición + recomendación detallada.
// Se abre desde el botón "Detalles" del MarketHero.
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Settings2, Lightbulb, BrainCircuit, MapPin } from 'lucide-react';
import { UserStateInput } from './UserStateInput';
import { MarketModeIndicator } from './MarketModeIndicator';
import { CollapsibleSection } from './CollapsibleSection';

export function DetailsSheet({
  open,
  onClose,
  marketData,
  decision,
  userState,
  onUserStateSubmit,
  decisionLoading
}) {
  if (!marketData) return null;

  const { technicalAnalysis: ta, marketMode } = marketData;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85svh] overflow-hidden
                       rounded-t-3xl border-t border-white/[0.08] bg-slate-950/95 backdrop-blur-xl
                       shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-4 w-8 h-8 rounded-lg bg-slate-800/80 border border-white/[0.06]
                         flex items-center justify-center hover:bg-slate-700/80 transition-colors text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Scroll body */}
            <div className="overflow-y-auto px-4 pb-8 pt-2 max-h-[calc(85svh-1.5rem)] space-y-3">

              {/* Insight IA — siempre visible si existe */}
              {decision?.portfolioInsight?.insight && (
                <PortfolioInsight insight={decision.portfolioInsight} />
              )}

              {/* Recomendación detallada — siempre visible */}
              {decision?.recommendation && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-300 leading-relaxed">{decision.recommendation}</p>
                </div>
              )}

              {/* Indicadores técnicos — colapsable */}
              {ta && (
                <CollapsibleSection title="Indicadores técnicos" icon={Activity} accent="blue" defaultOpen>
                  <div className="grid grid-cols-3 gap-2.5 pt-2">
                    <Metric label="RSI 14"  value={ta.rsi != null ? ta.rsi.toFixed(1) : '—'} sub={rsiTag(ta.rsi)}             color={rsiColor(ta.rsi)} />
                    <Metric label="ATR %"   value={ta.atrPercent != null ? `${ta.atrPercent}%` : '—'} sub="Volatilidad"        color={atrColor(ta.atrPercent)} />
                    <Metric label="Volumen" value={volumeLabel(ta.volumeStatus)} sub={ta.volumeRatio ? `×${ta.volumeRatio}` : ''} color={volumeColor(ta.volumeStatus)} />
                    <Metric label="EMA 20"  value={fmtPrice(ta.ema20)} sub="Corta"  color="text-slate-300" />
                    <Metric label="EMA 50"  value={fmtPrice(ta.ema50)} sub="Media"  color="text-slate-300" />
                    <Metric label="EMA 200" value={fmtPrice(ta.ema200)} sub="Larga" color="text-slate-300" />
                  </div>
                </CollapsibleSection>
              )}

              {/* Contexto de mercado — colapsable */}
              {marketMode && (
                <CollapsibleSection title="Contexto de mercado" icon={Activity} accent="slate">
                  <div className="pt-2">
                    <MarketModeIndicator mode={marketMode.mode} reasons={marketMode.reasons} />
                  </div>
                </CollapsibleSection>
              )}

              {/* Tu posición — colapsable */}
              <CollapsibleSection title="Tu posición" icon={Settings2} accent="slate" defaultOpen={!decision}>
                <div className="pt-2">
                  <UserStateInput
                    onSubmit={(s) => { onUserStateSubmit(s); onClose(); }}
                    initialCash={userState.cashPercent}
                    initialMode={userState.mode}
                    initialCapital={userState.totalCapital}
                  />
                  {decisionLoading && <p className="text-xs text-slate-500 text-center mt-3">Analizando señal...</p>}
                </div>
              </CollapsibleSection>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ icon: Icon, title, tint, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${tint}`} />
        <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color }) {
  return (
    <div className="bg-slate-900/60 border border-white/[0.05] rounded-xl p-3">
      <p className="text-[10px] text-slate-500 mb-1">{label}</p>
      <p className={`text-sm font-bold tabular ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function PortfolioInsight({ insight }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
      <BrainCircuit className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-blue-400/70 uppercase tracking-widest block mb-1.5">
          Análisis de tu posición
        </span>
        <p className="text-sm text-slate-300 leading-relaxed">{insight.insight}</p>
        {insight.optimalEntryPrice && (
          <div className="flex items-center gap-1.5 mt-2">
            <MapPin className="w-3 h-3 text-blue-400/60 shrink-0" />
            <span className="text-xs text-blue-400/80 font-mono tabular">
              Entrada sugerida: ${insight.optimalEntryPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(p) {
  if (p == null) return '—';
  if (p >= 10000) return `$${Math.round(p).toLocaleString('en-US')}`;
  if (p >= 1000)  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
function rsiColor(rsi) {
  if (rsi == null) return 'text-slate-400';
  if (rsi > 70) return 'text-red-400';
  if (rsi < 30) return 'text-emerald-400';
  if (rsi > 60 || rsi < 40) return 'text-amber-400';
  return 'text-slate-300';
}
function rsiTag(rsi) {
  if (rsi == null) return '';
  if (rsi > 70) return 'Sobrecompra';
  if (rsi < 30) return 'Sobreventa';
  return 'Neutral';
}
function atrColor(p) {
  if (p == null) return 'text-slate-400';
  if (p > 5) return 'text-red-400';
  if (p > 3) return 'text-amber-400';
  if (p < 1.5) return 'text-emerald-400';
  return 'text-slate-300';
}
function volumeLabel(s) {
  return { muy_alto: 'Alto', creciendo: 'Subiendo', normal: 'Normal', decreciendo: 'Bajando', muy_bajo: 'Bajo' }[s] ?? '—';
}
function volumeColor(s) {
  if (!s) return 'text-slate-400';
  if (['muy_alto','creciendo'].includes(s)) return 'text-emerald-400';
  if (['muy_bajo','decreciendo'].includes(s)) return 'text-red-400';
  return 'text-slate-300';
}

export default DetailsSheet;
