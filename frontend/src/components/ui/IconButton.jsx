// Botón circular (campana, ajustes, refrescar, cerrar). `badge` = punto de aviso.
export function IconButton({ icon: Icon, label, onClick, badge = false, active = false, spin = false, size = 'md', className = '', disabled = false }) {
  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled}
      className={`relative ${dim} shrink-0 rounded-full flex items-center justify-center border transition
        ${active ? 'bg-accent text-accent-ink border-accent' : 'bg-panel text-ink border-line hover:bg-panel-2'}
        disabled:opacity-40 ${className}`}
    >
      <Icon className={`${size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]'} ${spin ? 'animate-spin' : ''}`} />
      {badge && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-pink ring-2 ring-bg" />}
    </button>
  );
}

export default IconButton;
