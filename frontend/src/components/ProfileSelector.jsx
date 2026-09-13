// Selector de perfil con autenticación por PIN
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { hasProfile, setupPin, verifyPin, saveUserCryptos, getUserCryptos } from '../services/firestoreAuth';
import { useAuthStore } from '../store/authStore';
import { PROFILE_LIST, POPULAR_CRYPTOS } from '../data/profiles';

// ── Colores por perfil ────────────────────────────────────────────────────────

const ACCENT = {
  blue: {
    circle:     'bg-blue-600/30 border border-blue-500/40 text-blue-300',
    dot:        'bg-blue-400',
    chip:       'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    cardBorder: 'border-blue-500/40',
    cardBg:     'bg-blue-500/5',
    selected:   'border-blue-500 bg-blue-500/15',
    btn:        'bg-blue-600 hover:bg-blue-500',
  },
  purple: {
    circle:     'bg-purple-600/30 border border-purple-500/40 text-purple-300',
    dot:        'bg-purple-400',
    chip:       'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    cardBorder: 'border-purple-500/40',
    cardBg:     'bg-purple-500/5',
    selected:   'border-purple-500 bg-purple-500/15',
    btn:        'bg-purple-600 hover:bg-purple-500',
  },
  green: {
    circle:     'bg-emerald-600/30 border border-emerald-500/40 text-emerald-300',
    dot:        'bg-emerald-400',
    chip:       'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    cardBorder: 'border-emerald-500/40',
    cardBg:     'bg-emerald-500/5',
    selected:   'border-emerald-500 bg-emerald-500/15',
    btn:        'bg-emerald-600 hover:bg-emerald-500',
  },
};

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
  const [selectedCoins, setSelectedCoins] = useState([]);
  const [savingCoins, setSavingCoins]   = useState(false);
  const [customInput, setCustomInput]   = useState('');
  const [customError, setCustomError]   = useState('');

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
      setError('Error conectando con Firestore. Reintentá.');
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
            triggerShake('Error guardando el PIN. Reintentá.');
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
            const firestoreCoins = await getUserCryptos(selectedProfile.id);
            await afterPinSuccess(selectedProfile, firestoreCoins);
          } else {
            triggerShake('PIN incorrecto. Reintentá.');
            setTimeout(() => setPin(''), 600);
          }
        } catch (err) {
          triggerShake('Error verificando el PIN. Reintentá.');
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
    setCustomInput('');
    setCustomError('');
  };

  // ── Selección de coins ────────────────────────────────────────────────────

  const MAX_COINS = 2;

  const toggleCoin = (symbol) => {
    setCustomError('');
    setSelectedCoins(prev => {
      if (prev.includes(symbol)) return prev.filter(s => s !== symbol);
      if (prev.length >= MAX_COINS) return prev; // ya en el límite — silencioso
      return [...prev, symbol];
    });
  };

  const addCustomCoin = () => {
    const sym = customInput.trim().toUpperCase();
    setCustomError('');
    if (!sym) return;
    if (!/^[A-Z0-9]{2,10}$/.test(sym)) {
      setCustomError('Usá solo letras y números (2–10 caracteres).');
      return;
    }
    if (selectedCoins.includes(sym)) {
      setCustomError(`${sym} ya está seleccionado.`);
      return;
    }
    if (selectedCoins.length >= MAX_COINS) {
      setCustomError(`Máximo ${MAX_COINS} activos. Quitá uno primero.`);
      return;
    }
    setSelectedCoins(prev => [...prev, sym]);
    setCustomInput('');
  };

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

  const accent      = selectedProfile ? ACCENT[selectedProfile.accentColor] ?? ACCENT.blue : ACCENT.blue;
  const currentPin  = step === 'confirm' ? confirmPin : pin;
  const stepTitle   = {
    setup:   `Primera sesión, ${selectedProfile?.name}. Establecé tu PIN de 4 dígitos.`,
    confirm: 'Confirmá tu PIN.',
    verify:  `Bienvenido, ${selectedProfile?.name}.`,
  }[step] ?? '';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-svh bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-xl bg-blue-600/80 flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="text-slate-300 font-semibold tracking-wide">Crypto Context</span>
        </div>

        <AnimatePresence mode="wait">

          {/* ── Paso: selección de perfiles ──────────────────────────────── */}
          {step === 'profiles' && (
            <motion.div
              key="profiles"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-center text-slate-400 text-sm mb-6">¿Quién sos?</p>
              <div className="flex gap-3 justify-center flex-wrap">
                {PROFILE_LIST.map((profile, i) => {
                  const a = ACCENT[profile.accentColor] ?? ACCENT.blue;
                  return (
                    <motion.button
                      key={profile.id}
                      onClick={() => handleSelectProfile(profile)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.25 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`flex flex-col items-center gap-3 p-5 rounded-2xl
                        bg-slate-900/80 border ${a.cardBorder} ${a.cardBg}
                        hover:bg-slate-800/80 transition-colors w-[calc(33%-0.5rem)] min-w-[90px]`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${a.circle}`}>
                        {profile.initial}
                      </div>
                      <span className="text-white font-semibold text-sm">{profile.name}</span>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {profile.cryptos.length > 0
                          ? profile.cryptos.map(c => (
                              <span key={c} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.chip}`}>{c}</span>
                            ))
                          : <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.chip}`}>Nuevo</span>
                        }
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {error && <p className="text-center text-red-400 text-sm mt-4">{error}</p>}
            </motion.div>
          )}

          {/* ── Paso: loading ─────────────────────────────────────────────── */}
          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-12"
            >
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
            </motion.div>
          )}

          {/* ── Pasos: setup / confirm / verify ──────────────────────────── */}
          {(step === 'setup' || step === 'confirm' || step === 'verify') && (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center gap-6"
            >
              <p className="text-center text-slate-300 text-sm leading-relaxed px-2">
                {stepTitle}
              </p>

              <motion.div
                className="flex gap-3"
                animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-colors duration-150
                      ${i < currentPin.length ? accent.dot : 'bg-slate-700'}`}
                  />
                ))}
              </motion.div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    key="err"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-red-400 text-xs text-center -mt-2"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-3 gap-3 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <NumpadButton key={n} label={String(n)} onPress={() => handleDigit(String(n))} />
                ))}
                <div />
                <NumpadButton label="0" onPress={() => handleDigit('0')} />
                <NumpadButton label="⌫" onPress={handleBackspace} subtle />
              </div>

              <button
                onClick={handleBack}
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors mt-1"
              >
                ← Volver
              </button>
            </motion.div>
          )}

          {/* ── Paso: selección de coins ──────────────────────────────────── */}
          {step === 'select-coins' && (
            <motion.div
              key="select-coins"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              {/* Encabezado + contador */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-base">¿Qué activos seguís?</p>
                  <p className="text-slate-500 text-xs mt-0.5">Máximo 2 activos.</p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${selectedCoins.length === MAX_COINS ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {selectedCoins.length}/{MAX_COINS}
                </span>
              </div>

              {/* Seleccionados */}
              {selectedCoins.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {selectedCoins.map(sym => (
                    <motion.span
                      key={sym}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${accent.chip}`}
                    >
                      {sym}
                      <button onClick={() => toggleCoin(sym)} className="opacity-70 hover:opacity-100">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </div>
              )}

              {/* Grid de populares */}
              <div className="flex flex-wrap gap-2">
                {POPULAR_CRYPTOS.map((coin) => {
                  const isSelected = selectedCoins.includes(coin.symbol);
                  const isDisabled = !isSelected && selectedCoins.length >= MAX_COINS;
                  return (
                    <motion.button
                      key={coin.symbol}
                      onClick={() => toggleCoin(coin.symbol)}
                      whileTap={{ scale: 0.95 }}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                        ${isSelected
                          ? `${accent.selected} text-white`
                          : isDisabled
                          ? 'border-white/[0.04] bg-slate-900/30 text-slate-600 cursor-not-allowed'
                          : 'border-white/[0.08] bg-slate-900/60 text-slate-300 hover:bg-slate-800/60'
                        }`}
                    >
                      {isSelected && <Check className="inline w-3 h-3 mr-1" strokeWidth={3} />}
                      {coin.symbol}
                      <span className="ml-1 text-slate-500 font-normal">{coin.label}</span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Input personalizado */}
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={customInput}
                  onChange={e => { setCustomInput(e.target.value.toUpperCase()); setCustomError(''); }}
                  onKeyDown={e => e.key === 'Enter' && addCustomCoin()}
                  placeholder="Otra (ej: SOL, LINK…)"
                  maxLength={10}
                  className="flex-1 bg-slate-900/80 border border-white/[0.08] rounded-lg px-3 py-2
                    text-sm text-white placeholder-slate-600 focus:outline-none focus:border-slate-500"
                />
                <button
                  onClick={addCustomCoin}
                  disabled={selectedCoins.length >= MAX_COINS}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${selectedCoins.length < MAX_COINS
                      ? `${accent.btn} text-white`
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                >
                  +
                </button>
              </div>
              {customError && <p className="text-amber-400 text-xs -mt-2">{customError}</p>}

              {error && <p className="text-red-400 text-xs text-center">{error}</p>}

              <motion.button
                onClick={handleConfirmCoins}
                disabled={selectedCoins.length === 0 || savingCoins}
                whileTap={{ scale: 0.97 }}
                className={`w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all mt-1
                  ${selectedCoins.length > 0
                    ? `${accent.btn} opacity-100`
                    : 'bg-slate-800 opacity-40 cursor-not-allowed'
                  }`}
              >
                {savingCoins ? 'Guardando…' : 'Entrar →'}
              </motion.button>

              <button
                onClick={handleBack}
                className="text-slate-500 hover:text-slate-300 text-xs text-center transition-colors"
              >
                ← Volver
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Sub-componente: botón del teclado numérico ────────────────────────────────

function NumpadButton({ label, onPress, subtle = false }) {
  return (
    <motion.button
      onClick={onPress}
      whileTap={{ scale: 0.93 }}
      className={`h-14 rounded-xl flex items-center justify-center text-lg font-medium
        transition-colors select-none
        ${subtle
          ? 'bg-transparent text-slate-500 hover:text-slate-300'
          : 'bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white border border-white/[0.05]'
        }`}
    >
      {label}
    </motion.button>
  );
}

export default ProfileSelector;
