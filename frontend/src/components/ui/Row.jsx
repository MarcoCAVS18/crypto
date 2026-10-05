// Fila de lista (etiqueta a la izquierda, dato a la derecha). Las filas van dentro de UN panel, separadas por línea fina.
export function Row({ label, sub = null, value = null, right = null, tone = 'ink', onClick = null, className = '' }) {
  const color = { ink: 'text-ink', accent: 'text-accent', pink: 'text-pink', warn: 'text-warn', muted: 'text-muted' }[tone] ?? 'text-ink';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick || undefined} className={`w-full flex items-center justify-between gap-4 py-3.5 text-left ${onClick ? 'active:opacity-70' : ''} ${className}`}>
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{label}</p>
        {sub && <p className="text-xs text-muted mt-0.5 line-clamp-2">{sub}</p>}
      </div>
      <div className="shrink-0 text-right">
        {value !== null && <p className={`text-sm font-semibold num ${color}`}>{value}</p>}
        {right}
      </div>
    </Tag>
  );
}

/** Contenedor de filas con separadores (sin cajas internas). */
export function Rows({ children, className = '' }) {
  return <div className={`divide-y divide-line ${className}`}>{children}</div>;
}

export default Row;
