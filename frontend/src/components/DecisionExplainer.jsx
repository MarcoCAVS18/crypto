// "¿Por qué esta señal?": qué pesó en el score, cómo se decidió el tamaño y qué datos faltan.
// Todo sale de lo que ya devuelve la API (ver utils/explainDecision.js); no calcula nada nuevo.
import { HelpCircle, AlertTriangle, Info } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { buildExplanation } from '../utils/explainDecision';

const MODE_TEXT = { risk_on: 'Risk ON', risk_off: 'Risk OFF', neutral: 'Neutral' };
const LEVEL_STYLE = {
  error: { dot: 'bg-rose-400', text: 'text-rose-300' },
  warn:  { dot: 'bg-amber-400', text: 'text-amber-300' },
  info:  { dot: 'bg-slate-500', text: 'text-slate-400' }
};

function FactorRow({ f }) {
  const color = f.direction === 'favor' ? 'bg-emerald-500/70' : f.direction === 'contra' ? 'bg-rose-500/70' : 'bg-slate-600';
  const sign = f.value > 0 ? '+' : '';
  return (
    <div title={f.hint ?? undefined} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-xs text-slate-300 truncate">{f.label}</span>
      <span className={`text-xs font-mono tabular ${f.direction === 'favor' ? 'text-emerald-400' : f.direction === 'contra' ? 'text-rose-400' : 'text-slate-500'}`}>
        {sign}{f.value.toFixed(2)}
      </span>
      <div className="col-span-2 h-1 rounded-full bg-white/[0.05] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(f.direction === 'neutral' ? 2 : 6, f.barPct)}%` }} />
      </div>
    </div>
  );
}

export function DecisionExplainer({ decision, marketMode, symbol }) {
  const e = buildExplanation({ decision, marketMode, symbol });
  if (!e) return null;
  const problems = e.issues.filter(i => i.level !== 'info').length;

  return (
    <CollapsibleSection
      title="¿Por qué esta señal?" icon={HelpCircle} accent={problems ? 'amber' : 'blue'} defaultOpen={!!decision}
      badge={problems ? `${problems} dato${problems > 1 ? 's' : ''} con problema` : null}
    >
      <div className="pt-2 space-y-4">
        {e.headline && (
          <p className="text-sm text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">{e.headline.actionLabel}</span>
            {e.headline.strength ? ` · ${e.headline.strength}` : ''}
            {e.headline.reason ? ` — ${e.headline.reason}` : ''}
          </p>
        )}

        {e.score && (
          <div className="text-xs text-slate-400">
            Contexto del oro: <span className="text-slate-200 font-medium">{MODE_TEXT[e.score.mode] ?? e.score.mode}</span> · score{' '}
            <span className="font-mono tabular text-slate-200">{e.score.value > 0 ? '+' : ''}{e.score.value.toFixed(2)}</span>
            {e.score.heldByHysteresis && ' (se mantiene el modo anterior hasta cruzar ±0.15)'}
          </div>
        )}

        {e.factors.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Qué pesó en el score</p>
            {e.factors.map(f => <FactorRow key={f.key} f={f} />)}
            <p className="text-[11px] text-slate-600">Verde: a favor del oro · rojo: en contra.</p>
          </div>
        )}

        {(e.sizing.length > 0 || e.adjustments.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Cómo se decidió el tamaño</p>
            {e.sizing.map((t, i) => <p key={`s${i}`} className="text-xs text-slate-300 leading-relaxed">{t}</p>)}
            {e.adjustments.map((a, i) => (
              <p key={`a${i}`} className="text-xs text-amber-300/90 leading-relaxed flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{a.text}{a.fraction != null && a.fraction < 1 ? ` (tamaño al ${Math.round(a.fraction * 100)} %)` : ''}</span>
              </p>
            ))}
          </div>
        )}

        {e.reasons.length > 0 && e.factors.length === 0 && (
          <ul className="space-y-1">
            {e.reasons.map((r, i) => <li key={i} className="text-xs text-slate-400 leading-relaxed">• {r}</li>)}
          </ul>
        )}

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Datos</p>
          {e.issues.length === 0 ? (
            <p className="text-xs text-emerald-400/90">Todos los insumos llegaron y están al día.</p>
          ) : e.issues.map(i => (
            <p key={i.key} className="text-xs leading-relaxed flex gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_STYLE[i.level].dot}`} />
              <span><span className={`font-medium ${LEVEL_STYLE[i.level].text}`}>{i.label}:</span> <span className="text-slate-400">{i.text}</span></span>
            </p>
          ))}
        </div>

        {e.caveat && (
          <p className="text-[11px] text-slate-500 leading-relaxed flex gap-1.5 pt-2 border-t border-white/[0.05]">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{e.caveat}</span>
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default DecisionExplainer;
