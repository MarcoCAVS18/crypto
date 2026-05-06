// Selector de perfil con autenticación por PIN
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { hasProfile, setupPin, verifyPin } from '../services/firestoreAuth';
import { useAuthStore } from '../store/authStore';
import { PROFILE_LIST } from '../data/profiles';

// ── Colores por perfil ────────────────────────────────────────────────────────

const ACCENT = {
  blue:   {
    circle:    'bg-blue-600/30 border border-blue-500/40 text-blue-300',
    dot:       'bg-blue-400',
    chip:      'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    cardBorder: 'border-blue-500/40',
    cardBg:    'bg-blue-500/5',
  },
  purple: {
    circle:    'bg-purple-600/30 border border-purple-500/40 text-purple-300',
    dot:       'bg-purple-400',
    chip:      'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    cardBorder: 'border-purple-500/40',
    cardBg:    'bg-purple-500/5',
  },
};

// ── Componente principal ──────────────────────────────────────────────────────

export function ProfileSelector() {
  const login = useAuthStore((s) => s.login);

  const [step, setStep]           = useState('profiles'); // profiles | loading | setup | confirm | verify
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pin, setPin]             = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError]         = useState('');
  const [shake, setShake]         = useState(false);

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
            login(selectedProfile);
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
            login(selectedProfile);
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
    if (step === 'setup')    setPin(p => p.slice(0, -1));
    if (step === 'confirm')  setConfirmPin(p => p.slice(0, -1));
    if (step === 'verify')   setPin(p => p.slice(0, -1));
    setError('');
  };

  const handleBack = () => {
    setStep('profiles');
    setSelectedProfile(null);
    setPin('');
    setConfirmPin('');
    setError('');
  };

  // ── Derivados ─────────────────────────────────────────────────────────────

  const accent = selectedProfile ? ACCENT[selectedProfile.accentColor] : ACCENT.blue;
  const currentPin = step === 'confirm' ? confirmPin : pin;

  const stepTitle = {
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
              <div className="flex gap-4 justify-center">
                {PROFILE_LIST.map((profile, i) => {
                  const a = ACCENT[profile.accentColor];
                  return (
                    <motion.button
                      key={profile.id}
                      onClick={() => handleSelectProfile(profile)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.25 }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl
                        bg-slate-900/80 border ${a.cardBorder} ${a.cardBg}
                        hover:bg-slate-800/80 transition-colors`}
                    >
                      {/* Inicial */}
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${a.circle}`}>
                        {profile.initial}
                      </div>

                      {/* Nombre */}
                      <span className="text-white font-semibold text-base">{profile.name}</span>

                      {/* Chips de cryptos */}
                      <div className="flex flex-wrap gap-1 justify-center">
                        {profile.cryptos.map(c => (
                          <span key={c} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.chip}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {error && (
                <p className="text-center text-red-400 text-sm mt-4">{error}</p>
              )}
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
              {/* Título */}
              <p className="text-center text-slate-300 text-sm leading-relaxed px-2">
                {stepTitle}
              </p>

              {/* Puntos indicadores del PIN */}
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

              {/* Mensaje de error */}
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

              {/* Teclado numérico */}
              <div className="grid grid-cols-3 gap-3 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <NumpadButton key={n} label={String(n)} onPress={() => handleDigit(String(n))} />
                ))}
                {/* Fila inferior: vacío, 0, borrar */}
                <div />
                <NumpadButton label="0" onPress={() => handleDigit('0')} />
                <NumpadButton label="⌫" onPress={handleBackspace} subtle />
              </div>

              {/* Botón volver */}
              <button
                onClick={handleBack}
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors mt-1"
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
