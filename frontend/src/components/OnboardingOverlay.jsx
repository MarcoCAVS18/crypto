// Bienvenida de 3 pasos (una sola vez por dispositivo).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Wallet, MessageCircle, ArrowRight, X } from 'lucide-react';

const STORAGE_KEY = 'crypto_onboarding_done';

export function useOnboarding() {
  const done = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) === 'true' : true;
  return !done;
}

const STEPS = [
  { icon: BarChart3, title: 'La señal, en una palabra', body: 'En Inicio ves el precio, las zonas de compra y venta, y una señal clara: Comprar, Esperar o Vender. Tocá “Ver por qué y las órdenes” para el detalle.' },
  { icon: Wallet, title: 'Cargá tus operaciones', body: 'En Portfolio registrás tus compras y ventas. Con eso la app calcula tu promedio, tu ganancia o pérdida y cuánto te conviene comprar.' },
  { icon: MessageCircle, title: 'Preguntale al asistente', body: 'Desde el tercer ícono podés consultar por la zona, el contexto o por qué la señal dice lo que dice. Conoce tu posición y el mercado actual.' }
];

export function OnboardingOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const finish = () => { try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* sin storage */ } onDone(); };
  const next = () => (step < STEPS.length - 1 ? setStep(s => s + 1) : finish());
  const { icon: Icon, title, body } = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0">
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 260, delay: 0.05 }}
        className="relative w-full max-w-sm rounded-[32px] border border-line bg-panel p-7">
        <button onClick={finish} aria-label="Saltar" className="absolute top-5 right-5 w-9 h-9 rounded-full bg-panel-2 flex items-center justify-center text-muted hover:text-ink"><X className="w-4 h-4" /></button>
        <div className="flex gap-1.5 mb-7">
          {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-accent' : 'w-3 bg-panel-2'}`} />)}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            <span className="w-16 h-16 rounded-full bg-accent text-accent-ink flex items-center justify-center mb-6 glow-accent"><Icon className="w-7 h-7" /></span>
            <h2 className="text-2xl font-bold text-ink mb-2">{title}</h2>
            <p className="text-sm text-muted leading-relaxed">{body}</p>
          </motion.div>
        </AnimatePresence>
        <button onClick={next} className="mt-8 w-full flex items-center justify-center gap-2 py-4 rounded-full bg-accent text-accent-ink font-bold">
          {last ? 'Empezar' : 'Siguiente'}<ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}

export default OnboardingOverlay;
