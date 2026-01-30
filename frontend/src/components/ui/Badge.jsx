// Componente Badge para indicadores y tags

export function Badge({ children, color = 'gray', size = 'md' }) {
  const colors = {
    green: 'bg-green-500/20 text-green-400 border-green-500/50',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    red: 'bg-red-500/20 text-red-400 border-red-500/50',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base font-semibold'
  };

  return (
    <span className={`inline-flex items-center rounded-full border ${colors[color]} ${sizes[size]}`}>
      {children}
    </span>
  );
}

export default Badge;
