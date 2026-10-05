// Variación porcentual en píldora: verde si sube, rosa si baja.
export function Delta({ value, digits = 1, className = '' }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold num ${up ? 'bg-accent/15 text-accent' : 'bg-pink/15 text-pink'} ${className}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(digits)}%
    </span>
  );
}

export default Delta;
