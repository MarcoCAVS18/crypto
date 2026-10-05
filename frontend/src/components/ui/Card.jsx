// Compatibilidad con las pantallas viejas: mismo look que Panel (las variantes de color se reducen a tonos).
import { Panel } from './Panel';

const MAP = { default: 'default', highlighted: 'default', flat: 'flat', buy: 'soft', sell: 'soft', neutral: 'soft' };

export function Card({ children, className = '', variant = 'default' }) {
  return <Panel tone={MAP[variant] ?? 'default'} className={className}>{children}</Panel>;
}

export default Card;
