// Panel de perfil: edición de activos + cambiar de usuario
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogOut } from 'lucide-react';
import { saveUserCryptos } from '../services/firestoreAuth';
import { useAuthStore } from '../store/authStore';

const MAX_COINS = 2;
const FUTURES_SYMBOL = 'XAUUSDT';

const ACCENT = {
  blue: {
    circle: 'bg-blue-600/30 border border-blue-500/40 text-blue-300',
    chip:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    btn:    'bg-blue-600 hover:bg-blue-500',
  },
  purple: {
    circle: 'bg-purple-600/30 border border-purple-500/40 text-purple-300',
    chip:   'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    btn:    'bg-purple-600 hover:bg-purple-500',
  },
  green: {
    circle: 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-300',
    chip:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    btn:    'bg-emerald-600 hover:bg-emerald-500',
  },
};

export function ProfileSettingsSheet({ open, onClose, onLogout }) {
  const { currentUser, updateCryptos } = useAuthStore();

  const [coins, setCoins]               = useState([]);
  const [futuresOn, setFuturesOn]       = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]   = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const searchDebounce                  = useRef(null);
  const dropdownRef                     = useRef(null);

  // Sincronizar coins al abrir
  useEffect(() => {
    if (open && currentUser) {
      const all = currentUser.cryptos ?? [];
      setCoins(all.filter(c => c !== FUTURES_SYMBOL));
      setFuturesOn(all.includes(FUTURES_SYMBOL));
      setSearchQuery('');
      setSearchResults([]);
      setShowDropdown(false);
      setSaveError('');
    }
  }, [open, currentUser]);

  // Búsqueda CoinGecko debounced 350ms
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setShowDropdown(false); return; }
    clearTimeout(searchDebounce.current);
    setSearchLoading(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res  = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        const results = (data.coins ?? []).slice(0, 8).map(c => ({
          symbol: c.symbol.toUpperCase(),
          name:   c.name,
          thumb:  c.thumb,
        }));
        setSearchResults(results);
        setShowDropdown(results.length > 0);
        setSearchError('');
      } catch {
        setSearchError('Error buscando. Probá el símbolo directamente.');
        setShowDropdown(false);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [searchQuery]);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addCoin = (symbol) => {
    if (coins.includes(symbol) || coins.length >= MAX_COINS) return;
    setCoins(prev => [...prev, symbol]);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const removeCoin = (symbol) => setCoins(prev => prev.filter(s => s !== symbol));

  const handleSave = async () => {
    if (coins.length === 0 && !futuresOn) return;
    setSaving(true);
    setSaveError('');
    try {
      const all = [...coins, ...(futuresOn ? [FUTURES_SYMBOL] : [])];
      await saveUserCryptos(currentUser.id, all);
      updateCryptos(all);
      onClose();
    } catch {
      setSaveError('Error guardando. Reintentá.');
    } finally {
      setSaving(false);
    }
  };

  const accent = ACCENT[currentUser?.accentColor] ?? ACCENT.blue;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950 border-t border-white/[0.08] rounded-t-2xl px-5 pt-5"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-5" />

            {/* Header: avatar + nombre + cerrar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${accent.circle}`}>
                  {currentUser?.initial}
                </div>
                <div>
                  <p className="text-white font-semibold text-base leading-tight">{currentUser?.name}</p>
                  <p className="text-slate-500 text-xs">Perfil activo</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sección: activos */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-300 text-sm font-medium">Activos</p>
              <span className="text-xs text-slate-600 tabular-nums">{coins.length}/{MAX_COINS}</span>
            </div>

            {coins.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-4">
                {coins.map(sym => (
                  <motion.span
                    key={sym}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${accent.chip}`}
                  >
                    {sym}
                    <button onClick={() => removeCoin(sym)} className="opacity-60 hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </motion.span>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm mb-4">Ningún activo seleccionado</p>
            )}

            {/* Futuros — sección especial */}
            <div className="my-4 border-t border-white/[0.05]" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-slate-300 text-sm font-medium">XAUUSDT Perp</p>
                <p className="text-slate-600 text-xs mt-0.5">Futuros perpetuos de oro (Binance)</p>
              </div>
              <button
                onClick={() => setFuturesOn(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200
                  ${futuresOn ? 'bg-amber-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                  ${futuresOn ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <div className="my-4 border-t border-white/[0.05]" />

            {/* Buscador */}
            <div className="relative mb-1" ref={dropdownRef}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={coins.length >= MAX_COINS ? 'Límite alcanzado' : 'Agregar crypto…'}
                disabled={coins.length >= MAX_COINS}
                className="w-full bg-slate-900/80 border border-white/[0.08] rounded-xl px-4 py-3
                  text-sm text-white placeholder-slate-600 focus:outline-none focus:border-slate-500
                  disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              />
              {searchLoading && (
                <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
              )}
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute z-10 w-full mt-1 bg-slate-900 border border-white/[0.08] rounded-xl overflow-hidden shadow-xl"
                >
                  {searchResults.map(coin => {
                    const already = coins.includes(coin.symbol);
                    return (
                      <button
                        key={coin.symbol}
                        onClick={() => addCoin(coin.symbol)}
                        disabled={already}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800/80'}`}
                      >
                        {coin.thumb && (
                          <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                        )}
                        <span className="text-white text-sm font-semibold">{coin.symbol}</span>
                        <span className="text-slate-500 text-xs truncate">{coin.name}</span>
                        {already && <span className="ml-auto text-xs text-slate-600">ya agregado</span>}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </div>

            {searchError && <p className="text-amber-400 text-xs mt-1">{searchError}</p>}
            {saveError   && <p className="text-red-400 text-xs mt-1">{saveError}</p>}

            {/* Botón guardar */}
            <motion.button
              onClick={handleSave}
              disabled={(coins.length === 0 && !futuresOn) || saving}
              whileTap={{ scale: 0.97 }}
              className={`w-full mt-4 py-3 rounded-xl text-white font-semibold text-sm transition-all
                ${coins.length > 0 || futuresOn ? `${accent.btn} opacity-100` : 'bg-slate-800 opacity-40 cursor-not-allowed'}`}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </motion.button>

            {/* Separador */}
            <div className="my-4 border-t border-white/[0.06]" />

            {/* Botón cambiar de usuario */}
            <motion.button
              onClick={onLogout}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2
                bg-slate-900/60 border border-white/[0.06] text-slate-400 hover:text-white
                hover:border-white/[0.12] text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cambiar de usuario
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ProfileSettingsSheet;
