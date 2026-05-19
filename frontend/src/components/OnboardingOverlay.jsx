import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, BarChart3, Briefcase, ArrowRight, X } from 'lucide-react';

const STORAGE_KEY = 'crypto_onboarding_done';

export function useOnboarding() {
  const done = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY) === 'true'
    : true;
  return !done;
}

const STEPS = [
  {
    icon: BarChart3,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    title: 'Señal en tiempo real',
    body: 'El gráfico de velas muestra el precio en vivo con zonas de compra y venta. La señal BUY / WAIT / SELL se actualiza automáticamente.'
  },
  {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    title: 'Configurá tu posición',
    body: 'Tocá "Detalles" en el gráfico para ingresar tu capital disponible, modo (inversión o trading) y obtener una señal personalizada con montos exactos.'
  },
  {
    icon: Briefcase,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    title: 'Registrá tus operaciones',
    body: 'En la pestaña Portfolio podés cargar tus compras y ventas. La app calcula tu P&L en tiempo real y mejora las señales con tu precio promedio real.'
  }
];

export function OnboardingOverlay({ onDone }) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
      onDone();
    }
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onDone();
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0"
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 260, delay: 0.05 }}
        className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-slate-950/95 backdrop-blur-xl shadow-2xl p-6"
      >
        {/* Skip */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-blue-400' : i < step ? 'w-3 bg-slate-600' : 'w-3 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-5 ${current.bg}`}
          >
            <Icon className={`w-7 h-7 ${current.color}`} />
          </motion.div>
        </AnimatePresence>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
          >
            <h2 className="text-lg font-bold text-white mb-2">{current.title}</h2>
            <p className="text-sm text-slate-400 leading-relaxed">{current.body}</p>
          </motion.div>
        </AnimatePresence>

        {/* CTA */}
        <motion.button
          onClick={handleNext}
          whileTap={{ scale: 0.97 }}
          className="mt-7 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 transition-colors text-white font-semibold text-sm"
        >
          {isLast ? 'Empezar' : 'Siguiente'}
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

export default OnboardingOverlay;
