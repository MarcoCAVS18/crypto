// Input para el estado del usuario (cash disponible, capital total y modo)
import { useState } from 'react';
import { Button } from './ui/Button';
import { Wallet, Eye, TrendingUp, LineChart, DollarSign, Info } from 'lucide-react';

const MODE_CONFIG = {
  inversion: {
    id: 'inversion',
    label: 'Inversión',
    icon: TrendingUp,
    description: 'Largo plazo',
    detail: 'Posiciones grandes, señales basadas en EMA y zonas de precio. Ideal para acumular a lo largo del tiempo.'
  },
  trading: {
    id: 'trading',
    label: 'Trading',
    icon: LineChart,
    description: 'Corto plazo',
    detail: 'Señales más frecuentes usando RSI y zonas. Entradas y salidas tácticas con stop loss ajustado.'
  },
  observacion: {
    id: 'observacion',
    label: 'Observación',
    icon: Eye,
    description: 'Solo mirar',
    detail: 'No genera operaciones. Solo monitorear el mercado sin ejecutar nada.'
  }
};

export function UserStateInput({ onSubmit, initialCash = 50, initialMode = 'inversion', initialCapital = 0 }) {
  const [cashPercent, setCashPercent] = useState(initialCash);
  const [mode, setMode] = useState(initialMode);
  const [totalCapital, setTotalCapital] = useState(initialCapital);
  const [capitalInput, setCapitalInput] = useState(initialCapital > 0 ? String(initialCapital) : '');
  const [showModeDetail, setShowModeDetail] = useState(false);

  const cashAmount = totalCapital > 0 ? (totalCapital * cashPercent / 100) : null;
  const activeMode = MODE_CONFIG[mode];

  const handleCapitalChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setCapitalInput(raw);
    const parsed = parseFloat(raw);
    setTotalCapital(isNaN(parsed) ? 0 : parsed);
  };

  const handleSubmit = () => {
    onSubmit({ cashPercent, mode, totalCapital });
  };

  return (
    <div className="space-y-5">
      {/* Capital total */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Capital total disponible (USD)</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={capitalInput}
            onChange={handleCapitalChange}
            placeholder="Ej: 5000"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-4 py-2.5 text-white text-sm
                       focus:outline-none focus:border-blue-500 placeholder-gray-600"
          />
        </div>
        {totalCapital > 0 && (
          <p className="text-xs text-gray-500">
            Capital total registrado: <span className="text-gray-300">${totalCapital.toLocaleString('en-US')}</span>
          </p>
        )}
      </div>

      {/* Slider de Cash disponible */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-400 truncate">% disponible en efectivo</span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl font-bold text-white">{cashPercent}%</span>
            {cashAmount !== null && (
              <p className="text-xs text-blue-400">= ${cashAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            )}
          </div>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={cashPercent}
          onChange={(e) => setCashPercent(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        <div className="flex justify-between text-xs text-gray-600">
          <span>0% · Sin cash</span>
          <span>50%</span>
          <span>100% · Todo cash</span>
        </div>

        {/* Barra de interpretación */}
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div className={`rounded p-1.5 text-center transition-colors ${cashPercent < 30 ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-600'}`}>
            0–29% · Bajo
          </div>
          <div className={`rounded p-1.5 text-center transition-colors ${cashPercent >= 30 && cashPercent < 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-600'}`}>
            30–59% · Moderado
          </div>
          <div className={`rounded p-1.5 text-center transition-colors ${cashPercent >= 60 ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-600'}`}>
            60–100% · Alto
          </div>
        </div>
      </div>

      {/* Selector de Modo */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Modo de operación</span>
          <button
            onClick={() => setShowModeDetail(!showModeDetail)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="¿Qué significa cada modo?"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {Object.values(MODE_CONFIG).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`
                flex flex-col items-center gap-1 p-2 sm:p-2.5 rounded-lg border transition-all
                ${mode === m.id
                  ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }
              `}
            >
              <m.icon className="w-4 h-4" />
              <span className="text-[11px] sm:text-xs font-medium leading-tight text-center">{m.label}</span>
              <span className="text-[10px] opacity-70 hidden sm:block leading-tight">{m.description}</span>
            </button>
          ))}
        </div>

        {/* Detalle del modo seleccionado */}
        {showModeDetail && activeMode && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-400 leading-relaxed">{activeMode.detail}</p>
          </div>
        )}
      </div>

      <Button onClick={handleSubmit} className="w-full">
        Obtener Decisión
      </Button>
    </div>
  );
}

export default UserStateInput;
