// Monta a los hijos recién cuando entran en pantalla (una vez): así las animaciones de los gráficos se ven al llegar a ellos,
// no cuando la pantalla carga con el gráfico todavía fuera de la vista.
import { useRef } from 'react';
import { useInView } from 'framer-motion';

export function InView({ children, minHeight = 120, className = '' }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  return <div ref={ref} className={className} style={{ minHeight: seen ? undefined : minHeight }}>{seen ? children : null}</div>;
}

export default InView;
