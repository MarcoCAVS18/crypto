const colors = {
  green:  'bg-accent/15 text-accent',
  yellow: 'bg-warn/15 text-warn',
  red:    'bg-pink/15 text-pink',
  gray:   'bg-white/[0.06] text-muted',
  blue:   'bg-accent/15 text-accent',
  purple: 'bg-accent/15 text-accent'
};
const sizes = { sm: 'px-2 py-0.5 text-[11px]', md: 'px-2.5 py-1 text-xs', lg: 'px-4 py-1.5 text-sm' };

export function Badge({ children, color = 'gray', size = 'md' }) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${colors[color] ?? colors.gray} ${sizes[size] ?? sizes.md}`}>
      {children}
    </span>
  );
}

export default Badge;
