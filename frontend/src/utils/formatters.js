// Funciones de formateo para números, fechas y precios

// Formatea un precio con separadores de miles
export function formatPrice(price) {
  if (price === null || price === undefined) return 'N/A';

  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Formatea un porcentaje
export function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A';

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + '%';
}

// Formatea una fecha relativa (hace X minutos)
export function formatRelativeTime(date) {
  if (!date) return 'N/A';

  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

// Formatea una fecha completa
export function formatDateTime(date) {
  if (!date) return 'N/A';

  return new Date(date).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Formatea volumen en formato corto (1.2M, 500K, etc.)
export function formatVolume(volume) {
  if (!volume) return 'N/A';

  if (volume >= 1e9) {
    return (volume / 1e9).toFixed(2) + 'B';
  }
  if (volume >= 1e6) {
    return (volume / 1e6).toFixed(2) + 'M';
  }
  if (volume >= 1e3) {
    return (volume / 1e3).toFixed(2) + 'K';
  }

  return volume.toFixed(0);
}
