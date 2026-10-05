// Buscador de criptos (CoinGecko, con debounce) + fichas elegidas. Lo usan el alta de perfil y los ajustes.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function CoinPicker({ selected, onChange, max = 2, placeholder = 'Bitcoin, Solana, Dogecoin…' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const full = selected.length >= max;

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        const coins = (data.coins ?? []).slice(0, 8).map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name, thumb: c.thumb }));
        setResults(coins); setOpen(coins.length > 0); setError('');
      } catch { setError('No se pudo buscar. Probá escribir el símbolo directamente.'); setOpen(false); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const add = (symbol) => {
    if (selected.includes(symbol) || full) return;
    onChange([...selected, symbol]); setQuery(''); setResults([]); setOpen(false);
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {selected.map(sym => (
            <span key={sym} className="flex items-center gap-2 pl-4 pr-3 py-2 rounded-full bg-accent text-accent-ink text-sm font-bold">
              {sym}
              <button onClick={() => onChange(selected.filter(s => s !== sym))} aria-label={`Quitar ${sym}`} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative" ref={wrap}>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} disabled={full}
          placeholder={full ? `Máximo ${max} activos` : placeholder}
          className="w-full bg-panel-2 border border-line rounded-full px-5 py-3.5 text-ink placeholder:text-faint focus:outline-none focus:border-accent/60 disabled:opacity-40" />
        {loading && <span className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-line border-t-accent rounded-full animate-spin" />}
        {open && (
          <div className="absolute z-10 w-full mt-2 bg-panel border border-line rounded-3xl overflow-hidden shadow-2xl shadow-black/60">
            {results.map(c => {
              const already = selected.includes(c.symbol);
              return (
                <button key={c.symbol} onClick={() => add(c.symbol)} disabled={already}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left ${already ? 'opacity-40' : 'hover:bg-panel-2'}`}>
                  {c.thumb && <img src={c.thumb} alt="" className="w-5 h-5 rounded-full shrink-0" />}
                  <span className="text-sm font-semibold text-ink">{c.symbol}</span>
                  <span className="text-xs text-muted truncate">{c.name}</span>
                  {already && <span className="ml-auto text-xs text-faint">ya está</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}

export default CoinPicker;
