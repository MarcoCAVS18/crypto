// Hoja inferior (móvil) / modal centrado (escritorio). Un solo patrón para detalles, ajustes y formularios.
//
// Importante: el fondo y la hoja dejan de recibir toques EN CUANTO `open` pasa a false (pointer-events), sin depender de que
// termine la animación de salida, y se desmontan por temporizador. Así, aunque el navegador frene las animaciones (iPhone con
// ahorro de batería, pestaña en segundo plano), nunca queda una capa invisible tapando los botones.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

const EXIT_MS = 450;

export function Sheet({ open, onClose, title, children, header = null, maxWidth = 'max-w-lg', scrollKey = null }) {
  const body = useRef(null);
  const [mounted, setMounted] = useState(open);
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [scrollKey]);   // otra pestaña dentro de la hoja → arriba

  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    document.activeElement?.blur?.();                                        // baja el teclado (iPhone) antes de que la hoja salga
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open && !mounted) return null;
  const touch = { pointerEvents: open ? 'auto' : 'none' };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" style={touch} onClick={onClose} aria-hidden="true"
      />
      <motion.div
        role="dialog" aria-label={typeof title === 'string' ? title : undefined} aria-hidden={!open}
        initial={{ y: '100%' }} animate={{ y: open ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 340 }}
        className={`fixed z-50 bottom-0 inset-x-0 mx-auto w-full ${maxWidth} rounded-t-[32px] bg-bg border border-b-0 border-line
                    flex flex-col max-h-[90svh] sm:bottom-6 sm:rounded-[32px] sm:border-b`}
        style={{ ...touch, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="pt-3 pb-1 flex justify-center sm:hidden"><span className="w-10 h-1 rounded-full bg-white/15" /></div>
        <div className="px-5 pt-2 pb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink truncate">{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} size="sm" />
        </div>
        {header}
        <div ref={body} className="overflow-y-auto px-5 pb-8 flex-1">{children}</div>
      </motion.div>
    </>
  );
}

export default Sheet;
