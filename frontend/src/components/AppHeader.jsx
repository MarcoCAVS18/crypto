// Encabezado: avatar (abre el perfil), saludo + título de la pantalla, y botones circulares (actualizar, avisos).
import { RefreshCw, Bell } from 'lucide-react';
import { IconButton } from './ui/IconButton';

export function AppHeader({ initial, name, title, onOpenProfile, onRefresh, refreshing, hasNotice, onOpenNotices }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={onOpenProfile} aria-label={`Perfil de ${name}`}
          className="w-11 h-11 rounded-full bg-accent text-accent-ink font-bold text-base flex items-center justify-center shrink-0 glow-accent">
          {initial}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted leading-none">Hola, {name}</p>
          <h1 className="text-lg font-bold text-ink leading-tight truncate">{title}</h1>
        </div>
        <IconButton icon={RefreshCw} label="Actualizar" onClick={onRefresh} spin={refreshing} disabled={refreshing} />
        <IconButton icon={Bell} label="Avisos" onClick={onOpenNotices} badge={hasNotice} />
      </div>
    </header>
  );
}

export default AppHeader;
