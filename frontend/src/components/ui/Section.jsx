// Título de sección + acción opcional. Reemplaza los encabezados repetidos "CONTEXTO MACRO · ORO", "INDICADORES", etc.
export function Section({ title, action = null, children, className = '' }) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default Section;
