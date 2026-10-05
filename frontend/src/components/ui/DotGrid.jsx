// Actividad en puntos (referencia: "Your Activity"): una columna por semana, una fila por día.
// cells: { 'YYYY-MM-DD': { buy: n, sell: n } }. Verde = compra, rosa = venta, gris = sin operaciones.
import { motion, useReducedMotion } from 'framer-motion';
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const iso = (d) => d.toISOString().slice(0, 10);

export function DotGrid({ cells = {}, weeks = 12, now = new Date() }) {
  const reduce = useReducedMotion();
  // la última columna es la semana actual (lunes → domingo)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7;                       // 0 = lunes
  const start = new Date(today.getTime() - (dow + (weeks - 1) * 7) * 86400000);
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = new Date(start.getTime() + (w * 7 + d) * 86400000);
    return { key: iso(date), future: date > today, v: cells[iso(date)] };
  }));
  return (
    <div className="flex gap-2 items-start" role="img" aria-label="Actividad de operaciones por semana">
      <div className="flex flex-col gap-[7px] pt-px">
        {DAYS.map((d, i) => <span key={d} className={`h-[14px] leading-[14px] text-[9px] text-faint ${i % 2 ? 'opacity-0' : ''}`}>{d}</span>)}
      </div>
      <div className="flex flex-1 justify-between gap-[3px]">
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[7px]">
            {col.map((c, d) => {
              const buy = c.v?.buy ?? 0, sell = c.v?.sell ?? 0;
              const cls = c.future ? 'bg-transparent' : buy && sell ? 'bg-lime' : buy ? 'bg-accent' : sell ? 'bg-pink' : 'bg-panel-2';
              return <motion.span key={c.key} title={c.v ? `${c.key}: ${buy} compra(s), ${sell} venta(s)` : c.key} className={`w-[14px] h-[14px] rounded-full ${cls}`}
                initial={reduce ? false : { opacity: 0, scale: 0.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, delay: w * 0.035 + d * 0.01 }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DotGrid;
