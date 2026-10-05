// Campo de texto con el estilo nuevo (fondo oscuro, redondeado, foco verde)
export function Input({ type = 'text', value, onChange, placeholder = '', label = '', error = '', className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-xs text-muted">{label}</label>}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        className={`px-4 py-3 rounded-2xl bg-panel-2 border text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent/60
          ${error ? 'border-pink' : 'border-line focus:border-accent/60'}`}
        {...props}
      />
      {error && <span className="text-xs text-pink">{error}</span>}
    </div>
  );
}

export default Input;
