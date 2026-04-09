const colors = {
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10',
  yellow: 'bg-amber-500/15  text-amber-400  border-amber-500/30  shadow-amber-500/10',
  red:    'bg-red-500/15    text-red-400    border-red-500/30    shadow-red-500/10',
  gray:   'bg-slate-500/15  text-slate-400  border-slate-500/30',
  blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30   shadow-blue-500/10',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
};

const sizes = {
  sm: 'px-2 py-0.5 text-[11px] tracking-wide',
  md: 'px-2.5 py-1 text-xs tracking-wide',
  lg: 'px-4 py-1.5 text-sm font-bold tracking-widest'
};

export function Badge({ children, color = 'gray', size = 'md', glow = false }) {
  const glowClass = glow ? 'shadow-sm' : '';
  return (
    <span className={`
      inline-flex items-center rounded-full border font-semibold uppercase
      ${colors[color]} ${sizes[size]} ${glowClass}
    `}>
      {children}
    </span>
  );
}

export default Badge;
