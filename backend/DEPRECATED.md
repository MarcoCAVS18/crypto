# `backend/` está obsoleto

Este servidor (Express + SQLite + `ccxt`, pensado para Render) **duplica y quedó desincronizado** de `functions/`, que es la API
que realmente se despliega (Firebase Functions). El frontend llama a `/api` de Firebase Hosting, no a este servidor.

- No recibe correcciones: los arreglos de las fases P0–P5 (costo promedio, FRED, velas cerradas, motor, jobs, métricas) están **solo** en `functions/`.
- No se despliega ni corre en CI.
- Se conserva únicamente como referencia histórica. **Recomendado: eliminarlo** (`git rm -r backend`) cuando confirmes que no tenés nada corriendo en Render
  (`https://crypto-7fbc.onrender.com`); se puede recuperar del historial de git.
