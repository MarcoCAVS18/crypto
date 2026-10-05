// Selector de perfil con autenticación por PIN
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Delete } from 'lucide-react';
import { CoinPicker } from './CoinPicker';
import { hasProfile, setupPin, verifyPin, saveUserCryptos, getUserCryptos, lastVerifyMessage } from '../services/firestoreAuth';
import { useAuthStore } from '../store/authStore';
import { PROFILE_LIST } from '../data/profiles';

// ── Componente principal ──────────────────────────────────────────────────────

export function ProfileSelector() {
  const login = useAuthStore((s) => s.login);

  // profiles | loading | setup | confirm | verify | select-coins
  const [step, setStep]                 = useState('profiles');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pin, setPin]                   = useState('');
  const [confirmPin, setConfirmPin]     = useState('');
  const [error, setError]               = useState('');
  const [shake, setShake]               = useState(false);
  const [selectedCoins, setSelectedCoins]   = useState([]);
  const [savingCoins, setSavingCoins]       = useState(false);

  // ── Selección de perfil ───────────────────────────────────────────────────

  const handleSelectProfile = async (profile) => {
    setSelectedProfile(profile);
    setPin('');
    setConfirmPin('');
    setError('');
    setStep('loading');
    try {
      const exists = await hasProfile(profile.id);
      setStep(exists ? 'verify' : 'setup');
    } catch (err) {
      setError(err?.message ? `No se pudo conectar con el servidor: ${err.message}` : 'No se pudo conectar con el servidor. Reintentá.');
      setStep('profiles');
    }
  };

  // ── Entrada de PIN ────────────────────────────────────────────────────────

  const triggerShake = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const afterPinSuccess = async (profile, cryptosFromFirestore) => {
    // Si el perfil tiene coins configurados (hardcoded o en Firestore), entrar directo
    const firestoreCoins = cryptosFromFirestore;
    const profileCoins   = profile.cryptos ?? [];

    if (firestoreCoins && firestoreCoins.length > 0) {
      login({ ...profile, cryptos: firestoreCoins, defaultCrypto: firestoreCoins[0] });
    } else if (profileCoins.length > 0) {
      login(profile);
    } else {
      // Sin coins — mostrar selección
      setSelectedCoins([]);
      setStep('select-coins');
    }
  };

  const handleDigit = async (digit) => {
    if (step === 'setup') {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => {
          setStep('confirm');
          setConfirmPin('');
          setError('');
        }, 150);
      }
    } else if (step === 'confirm') {
      const next = confirmPin + digit;
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === pin) {
          try {
            await setupPin(selectedProfile.id, pin);
            await afterPinSuccess(selectedProfile, null);
          } catch (err) {
            triggerShake(err?.message || 'Error guardando el PIN. Reintentá.');
            setConfirmPin('');
          }
        } else {
          triggerShake('Los PINs no coinciden. Intentá de nuevo.');
          setTimeout(() => {
            setStep('setup');
            setPin('');
            setConfirmPin('');
          }, 600);
        }
      }
    } else if (step === 'verify') {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        try {
          const ok = await verifyPin(selectedProfile.id, next);
          if (ok) {
            const firestoreCoins = await getUserCryptos();
            await afterPinSuccess(selectedProfile, firestoreCoins);
          } else {
            triggerShake(lastVerifyMessage || 'PIN incorrecto. Reintentá.');
            setTimeout(() => setPin(''), 600);
          }
        } catch (err) {
          triggerShake(err?.message || 'Error verificando el PIN. Reintentá.');
          setTimeout(() => setPin(''), 600);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (step === 'setup')   setPin(p => p.slice(0, -1));
    if (step === 'confirm') setConfirmPin(p => p.slice(0, -1));
    if (step === 'verify')  setPin(p => p.slice(0, -1));
    setError('');
  };

  const handleBack = () => {
    setStep('profiles');
    setSelectedProfile(null);
    setPin('');
    setConfirmPin('');
    setError('');
    setSelectedCoins([]);
  };

  // ── Selección de coins ────────────────────────────────────────────────────

  const MAX_COINS = 2;

  const handleConfirmCoins = async () => {
    if (selectedCoins.length === 0) return;
    setSavingCoins(true);
    try {
      await saveUserCryptos(selectedProfile.id, selectedCoins);
      login({ ...selectedProfile, cryptos: selectedCoins, defaultCrypto: selectedCoins[0] });
    } catch (err) {
      setError('Error guardando tus coins. Reintentá.');
    } finally {
      setSavingCoins(false);
    }
  };

  // ── Derivados ─────────────────────────────────────────────────────────────

  const currentPin  = step === 'confirm' ? confirmPin : pin;
  const stepTitle   = {
    setup:   `Primera sesión, ${selectedProfile?.name}. Establecé tu PIN de 4 dígitos.`,
    confirm: 'Confirmá tu PIN.',
    verify:  `Bienvenido, ${selectedProfile?.name}.`,
  }[step] ?? '';

  // ── Render ────────────────────────────────────────────────────────────────

  const Back = () => (
    <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mt-2"><ArrowLeft className="w-4 h-4" />Volver</button>
  );

  return (
    <div className="min-h-svh flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className="w-11 h-11 rounded-full bg-accent text-accent-ink font-bold text-lg flex items-center justify-center glow-accent">C</span>
          <span className="text-xl font-bold text-ink">Crypto Context</span>
        </div>

        <AnimatePresence mode="wait">
          {step === 'profiles' && (
            <motion.div key="profiles" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <h1 className="text-center text-2xl font-bold text-ink mb-1">¿Quién sos?</h1>
              <p className="text-center text-sm text-muted mb-7">Elegí tu perfil para entrar.</p>
              <div className="space-y-3">
                {PROFILE_LIST.map((profile, i) => (
                  <motion.button key={profile.id} onClick={() => handleSelectProfile(profile)}
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center gap-4 p-4 rounded-[28px] bg-panel border border-line hover:bg-panel-2 text-left">
                    <span className="w-12 h-12 rounded-full bg-accent text-accent-ink text-lg font-bold flex items-center justify-center shrink-0">{profile.initial}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-bold text-ink">{profile.name}</span>
                      <span className="block text-xs text-muted">{profile.cryptos.length > 0 ? profile.cryptos.join(' · ') : 'Perfil nuevo'}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
              {error && <p className="text-center text-pink text-sm mt-5">{error}</p>}
            </motion.div>
          )}

          {step === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center py-12">
              <span className="w-8 h-8 border-2 border-line border-t-accent rounded-full animate-spin" />
            </motion.div>
          )}

          {(step === 'setup' || step === 'confirm' || step === 'verify') && (
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }} className="flex flex-col items-center gap-7">
              <p className="text-center text-ink text-lg font-semibold leading-snug px-2">{stepTitle}</p>
              <motion.div className="flex gap-4" animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}} transition={{ duration: 0.4 }}>
                {[0, 1, 2, 3].map(i => <span key={i} className={`w-4 h-4 rounded-full transition-colors ${i < currentPin.length ? 'bg-accent' : 'bg-panel-2 border border-line'}`} />)}
              </motion.div>
              <AnimatePresence>
                {error && <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-pink text-sm text-center -mt-3">{error}</motion.p>}
              </AnimatePresence>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <NumpadButton key={n} label={String(n)} onPress={() => handleDigit(String(n))} />)}
                <div />
                <NumpadButton label="0" onPress={() => handleDigit('0')} />
                <NumpadButton label={<Delete className="w-6 h-6" />} ariaLabel="Borrar" onPress={handleBackspace} subtle />
              </div>
              <Back />
            </motion.div>
          )}

          {step === 'select-coins' && (
            <motion.div key="select-coins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div><h1 className="text-2xl font-bold text-ink">¿Qué activos seguís?</h1><p className="text-sm text-muted mt-1">Buscá cualquier cripto. Máximo {MAX_COINS}.</p></div>
                <span className="text-sm font-bold text-muted num">{selectedCoins.length}/{MAX_COINS}</span>
              </div>
              <CoinPicker selected={selectedCoins} onChange={setSelectedCoins} max={MAX_COINS} />
              {error && <p className="text-pink text-sm text-center">{error}</p>}
              <button onClick={handleConfirmCoins} disabled={selectedCoins.length === 0 || savingCoins}
                className="w-full py-4 rounded-full bg-accent text-accent-ink font-bold glow-accent disabled:opacity-40 disabled:shadow-none">{savingCoins ? 'Guardando…' : 'Entrar'}</button>
              <div className="flex justify-center"><Back /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Botón del teclado numérico ────────────────────────────────────────────────

function NumpadButton({ label, onPress, subtle = false, ariaLabel }) {
  return (
    <motion.button onClick={onPress} whileTap={{ scale: 0.92 }} aria-label={ariaLabel}
      className={`h-16 rounded-full flex items-center justify-center text-2xl font-semibold select-none transition-colors
        ${subtle ? 'text-muted hover:text-ink' : 'bg-panel border border-line text-ink hover:bg-panel-2 active:bg-accent active:text-accent-ink'}`}>
      {label}
    </motion.button>
  );
}

export default ProfileSelector;
