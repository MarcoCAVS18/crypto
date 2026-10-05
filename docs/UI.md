# Interfaz (frontend)

Rediseño completo: negro con verde neón, paneles redondeados, números grandes, pestañas en píldora y barra inferior flotante.
Reglas de contenido: **una idea, un lugar** (la señal vive en la tarjeta de Inicio; los detalles, en la hoja "Detalles"), sin cajas dentro de cajas y sin textos repetidos.

## Pantallas
- **Inicio**: activos (píldoras) → precio + velas con zonas → *Señal* (Comprar / Esperar / Vender, monto y efecto en tu promedio) → resumen de mercado.
- **Detalles** (hoja, 3 pestañas): *Señal* (órdenes y por qué), *Mercado* (lectura de la IA, macro, indicadores, noticias), *Posición* (tus USDT).
- **Portfolio**: valor y P&L → distribución (donut) y posiciones → evolución → actividad → resultados de las señales → operaciones. Agregar operación y "Repartir USDT" son hojas.
- **Asistente**: pantalla completa (tercer ícono de la barra). **Avisos** (campana): alerta de zona + próximos eventos macro.

## Sistema de diseño
- Tokens en `src/index.css` (`@theme`): `bg, panel, panel-2, line, ink, muted, faint, accent, accent-ink, pink, lime, warn`. Las paletas por defecto de Tailwind (slate/violet/…) están re-pintadas para que lo viejo no desentone.
- Un solo acento: verde = a favor / acción, rosa = en contra, amarillo = espera. Tipografía DM Sans (local, `@fontsource-variable`).
- Componentes base en `src/components/ui/`: `Panel`, `Row/Rows`, `Section`, `PillTabs`, `IconButton`, `Sheet`, `Delta`, `DonutChart`, `DotGrid`, `Button`, `Input`, `Badge`, `Spinner`.
- Lógica de presentación pura y testeada: `utils/signalView.js`, `utils/portfolioView.js`.

## Colores de datos (gráficos)
Paleta validada con la guía de visualización contra la superficie oscura: `#3b9fd1` (PAXG), `#2da84a` (BTC), `#e0468a` (ETH) (`utils/chartColors.js`). El color sigue a la **entidad**, no al orden. El verde↔rosa queda en la banda "WARN" para daltonismo, por eso siempre hay leyenda, valores y 2 px de separación entre tramos. Los neones de la interfaz no se usan como marcas de datos.

## Probar sin red
`frontend/dev/mock-api.mjs` levanta una API simulada en `:3001` usando los módulos reales del motor (`functions/src/services`) con velas sintéticas deterministas:

```bash
cd frontend && node dev/mock-api.mjs &
VITE_API_URL=http://127.0.0.1:3001/api npm run dev
```
Para entrar sin PIN, sembrá en `localStorage`: `crypto-auth-v1` (usuario), `crypto-session-v1` (`mock-token`) y `crypto_onboarding_done` (`true`).
