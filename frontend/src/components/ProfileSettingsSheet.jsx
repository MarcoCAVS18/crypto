// Perfil: qué activos seguís (y futuros de oro) + cambiar de usuario.
import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Panel } from './ui/Panel';
import { CoinPicker } from './CoinPicker';
import { saveUserCryptos } from '../services/firestoreAuth';
import { useAuthStore } from '../store/authStore';

const MAX_COINS = 2;
const FUTURES_SYMBOL = 'XAUUSDT';

export function ProfileSettingsSheet({ open, onClose, onLogout }) {
  const { currentUser, updateCryptos } = useAuthStore();
  const [coins, setCoins] = useState([]);
  const [futuresOn, setFuturesOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (open && currentUser) {
      const all = currentUser.cryptos ?? [];
      setCoins(all.filter(c => c !== FUTURES_SYMBOL));
      setFuturesOn(all.includes(FUTURES_SYMBOL));
      setSaveError('');
    }
  }, [open, currentUser]);

  const canSave = coins.length > 0 || futuresOn;
  const save = async () => {
    if (!canSave) return;
    setSaving(true); setSaveError('');
    try {
      const all = [...coins, ...(futuresOn ? [FUTURES_SYMBOL] : [])];
      await saveUserCryptos(currentUser.id, all);
      updateCryptos(all);
      onClose();
    } catch { setSaveError('No se pudo guardar. Probá de nuevo.'); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tu perfil">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-accent text-accent-ink text-xl font-bold flex items-center justify-center">{currentUser?.initial}</span>
          <div><p className="text-lg font-bold text-ink leading-tight">{currentUser?.name}</p><p className="text-sm text-muted">Perfil activo</p></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3"><p className="text-base font-bold text-ink">Activos que seguís</p><span className="text-xs text-muted num">{coins.length}/{MAX_COINS}</span></div>
          <CoinPicker selected={coins} onChange={setCoins} max={MAX_COINS} placeholder="Agregar cripto…" />
        </div>

        <Panel tone="soft" className="flex items-center justify-between gap-4 !py-4">
          <div><p className="text-sm font-semibold text-ink">Futuros de oro (XAUUSDT)</p><p className="text-xs text-muted mt-0.5">Perpetuos en Binance</p></div>
          <button role="switch" aria-checked={futuresOn} onClick={() => setFuturesOn(v => !v)}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${futuresOn ? 'bg-accent' : 'bg-panel-2 border border-line'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-transform ${futuresOn ? 'translate-x-5 bg-accent-ink' : 'bg-muted'}`} />
          </button>
        </Panel>

        {saveError && <p className="text-sm text-pink">{saveError}</p>}
        <button onClick={save} disabled={!canSave || saving} className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold glow-accent disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        <button onClick={onLogout} className="w-full py-3.5 rounded-full bg-panel border border-line text-muted hover:text-ink font-semibold text-sm flex items-center justify-center gap-2"><LogOut className="w-4 h-4" />Cambiar de usuario</button>
      </div>
    </Sheet>
  );
}

export default ProfileSettingsSheet;
