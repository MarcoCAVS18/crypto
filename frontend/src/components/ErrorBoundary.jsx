// Red de seguridad: si una pantalla falla al dibujarse, se muestra un aviso con "Reintentar" en vez de dejar la app muerta.
import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[UI] pantalla con error:', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-[28px] bg-panel border border-line p-6 text-center space-y-4 mt-6">
        <p className="text-lg font-bold text-ink">Algo falló en esta pantalla</p>
        <p className="text-sm text-muted">Tus datos están a salvo. Probá de nuevo; si sigue, actualizá la app.</p>
        <button onClick={() => this.setState({ error: null })} className="px-6 py-3 rounded-full bg-accent text-accent-ink font-bold">Reintentar</button>
      </div>
    );
  }
}

export default ErrorBoundary;
