// Superficie base. Una sola forma de "card": oscura, redondeada, sin sombras pesadas.
// tone: default (panel) · soft (más clara) · flat (sin fondo) · accent (verde, para la acción principal)
const TONES = {
  default: 'bg-panel border border-line',
  soft:    'bg-panel-2/70 border border-line',
  flat:    'bg-transparent',
  accent:  'bg-accent text-accent-ink'
};

export function Panel({ children, className = '', tone = 'default', padded = true, as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`rounded-[28px] ${padded ? 'p-5' : ''} ${TONES[tone] ?? TONES.default} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export default Panel;
