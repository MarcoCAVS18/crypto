// "¿Por qué?": qué pesó en el score, cómo se decidió el tamaño y qué datos faltan. Todo sale de lo que ya devuelve la API
// (ver utils/explainDecision.js). La acción y el motivo ya están en la tarjeta de la señal: acá no se repiten.
import { AlertTriangle, Info } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Section } from './ui/Section';
import { buildExplanation } from '../utils/explainDecision';
import { modeView } from '../utils/signalView';

const LEVEL = { error: { dot: 'bg-pink', text: 'text-pink' }, warn: { dot: 'bg-warn', text: 'text-warn' }, info: { dot: 'bg-faint', text: 'text-muted' } };

function FactorRow({ f }) {
  const color = f.direction === 'favor' ? 'bg-accent' : f.direction === 'contra' ? 'bg-pink' : 'bg-faint';
  const txt = f.direction === 'favor' ? 'text-accent' : f.direction === 'contra' ? 'text-pink' : 'text-muted';
  return (
    <div title={f.hint ?? undefined}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink truncate">{f.label}</span>
        <span className={`text-xs font-semibold num ${txt}`}>{f.value > 0 ? '+' : ''}{f.value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-2 mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(f.direction === 'neutral' ? 2 : 6, f.barPct)}%` }} />
      </div>
    </div>
  );
}

export function DecisionExplainer({ decision, marketMode, symbol }) {
  const e = buildExplanation({ decision, marketMode, symbol });
  if (!e) return null;
  const mode = e.score ? modeView(e.score.mode) : null;

  return (
    <div className="space-y-7">
      {e.factors.length > 0 && (
        <Section title="Qué pesó en el score" action={mode && <span className="text-xs text-muted">{mode.label} · {e.score.value > 0 ? '+' : ''}{e.score.value.toFixed(2)}</span>}>
          <Panel className="space-y-4">
            {e.factors.map(f => <FactorRow key={f.key} f={f} />)}
            <p className="text-xs text-faint">Verde: a favor del oro · rosa: en contra.{e.score?.heldByHysteresis ? ' El modo anterior se mantiene hasta cruzar ±0.15.' : ''}</p>
          </Panel>
        </Section>
      )}

      {(e.sizing.length > 0 || e.adjustments.length > 0) && (
        <Section title="Cómo se decidió el tamaño">
          <Panel className="space-y-3">
            {e.sizing.map((t, i) => <p key={`s${i}`} className="text-sm text-ink/90 leading-relaxed">{t}</p>)}
            {e.adjustments.map((a, i) => (
              <p key={`a${i}`} className="text-sm text-warn flex gap-2 leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{a.text}{a.fraction != null && a.fraction < 1 ? ` (tamaño al ${Math.round(a.fraction * 100)} %)` : ''}</span>
              </p>
            ))}
          </Panel>
        </Section>
      )}

      {e.reasons.length > 0 && e.factors.length === 0 && (
        <Section title="Por qué el mercado está así">
          <Panel><ul className="space-y-2">{e.reasons.map((r, i) => <li key={i} className="text-sm text-ink/90 leading-relaxed">• {r}</li>)}</ul></Panel>
        </Section>
      )}

      <Section title="Estado de los datos">
        <Panel className="space-y-2.5">
          {e.issues.length === 0 ? <p className="text-sm text-accent">Todos los insumos llegaron y están al día.</p> : e.issues.map(i => (
            <p key={i.key} className="text-sm leading-relaxed flex gap-2.5">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL[i.level].dot}`} />
              <span><span className={`font-semibold ${LEVEL[i.level].text}`}>{i.label}:</span> <span className="text-muted">{i.text}</span></span>
            </p>
          ))}
        </Panel>
      </Section>

      {e.caveat && (
        <p className="text-xs text-faint leading-relaxed flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /><span>{e.caveat}</span></p>
      )}
    </div>
  );
}

export default DecisionExplainer;
