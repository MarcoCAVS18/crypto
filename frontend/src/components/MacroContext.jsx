// Panel de contexto macroeconómico para PAXG / oro tokenizado
// Muestra: DXY, bono 10Y, sentimiento IA (Groq), titulares recientes

import { TrendingUp, TrendingDown, Minus, DollarSign, Newspaper, BrainCircuit, RefreshCw, Clock } from 'lucide-react';
import { Card } from './ui/Card';

function DeltaBadge({ value, invertSign = false }) {
  if (value == null) return null;
  // invertSign: para DXY, sube = malo para oro
  const isPositive = invertSign ? value < 0 : value > 0;
  const isNegative = invertSign ? value > 0 : value < 0;
  const sign = value >= 0 ? '+' : '';
  const colorClass = isPositive
    ? 'text-emerald-400'
    : isNegative
    ? 'text-red-400'
    : 'text-gray-400';

  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {sign}{value.toFixed(2)}%
    </span>
  );
}

function MacroRow({ label, value, unit = '', delta, invertSign = false, info }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
      <div>
        <span className="text-sm text-gray-300">{label}</span>
        {info && <p className="text-xs text-gray-500 mt-0.5">{info}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white">
          {value != null ? `${value}${unit}` : '—'}
        </span>
        {delta != null && <DeltaBadge value={delta} invertSign={invertSign} />}
      </div>
    </div>
  );
}

const SENTIMENT_CONFIG = {
  bullish: { label: 'Alcista', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: TrendingUp },
  neutral: { label: 'Neutral',  color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  icon: Minus      },
  bearish: { label: 'Bajista',  color: 'text-red-400',     bg: 'bg-red-400/10',     icon: TrendingDown }
};

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return 'hace menos de 1 min';
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  return `hace ${h}h`;
}

/**
 * @param {{ goldContext: object }} props
 * goldContext shape: { macro, sentiment, sentimentScore, reasoning, keyFactors, headlines, fetchedAt, fromCache }
 */
export function MacroContext({ goldContext }) {
  if (!goldContext) return null;

  const { macro, sentiment, reasoning, keyFactors = [], headlines = [], fetchedAt, fromCache } = goldContext;
  const sentCfg = SENTIMENT_CONFIG[sentiment] ?? SENTIMENT_CONFIG.neutral;
  const SentIcon = sentCfg.icon;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-gray-400">Contexto Macro · Oro</h2>
        </div>
        {fetchedAt && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {fromCache && <Clock className="w-3 h-3" />}
            <span>{formatRelativeTime(fetchedAt)}</span>
          </div>
        )}
      </div>

      {/* Sentimiento IA */}
      <div className={`flex items-start gap-3 p-3 rounded-lg ${sentCfg.bg} mb-4`}>
        <SentIcon className={`w-5 h-5 mt-0.5 shrink-0 ${sentCfg.color}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold ${sentCfg.color}`}>
              {sentCfg.label} para el oro
            </span>
          </div>
          {reasoning && (
            <p className="text-xs text-gray-300 leading-relaxed">{reasoning}</p>
          )}
          {keyFactors.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {keyFactors.map((f, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                  <span className="shrink-0 mt-0.5">·</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Datos macro */}
      {macro && (macro.dxy || macro.tenYearYield) && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Indicadores macro</span>
          </div>
          <div className="bg-gray-800/50 rounded-lg px-3">
            {macro.dxy && (
              <MacroRow
                label="DXY (Índice Dólar)"
                value={macro.dxy.value?.toFixed(2)}
                delta={macro.dxy.changePercent}
                invertSign={true}
                info="Dólar sube → oro baja"
              />
            )}
            {macro.tenYearYield && (
              <MacroRow
                label="Bono EE.UU. 10 años"
                value={macro.tenYearYield.value?.toFixed(2)}
                unit="%"
                delta={macro.tenYearYield.changePercent}
                invertSign={true}
                info="Yield alto → menor atractivo del oro"
              />
            )}
          </div>
        </div>
      )}

      {/* Titulares recientes */}
      {headlines.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Newspaper className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Noticias recientes ({headlines.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {headlines.slice(0, 5).map((headline, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                <span className="shrink-0 text-gray-600 font-mono">{i + 1}.</span>
                <span>{headline}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default MacroContext;
