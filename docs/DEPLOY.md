# Despliegue (Firebase)

**Todo corre en Firebase** — `https://pal-crypto.web.app` / `https://pal-crypto.firebaseapp.com`: Hosting sirve el frontend (`frontend/dist`) y reescribe `/api/**` a la Cloud Function `api` (`us-central1`).
Netlify y Render **ya no se usan**: `backend/` (Render) está obsoleto y Netlify no tiene proxy a la API.

## Flujo
| Qué | Cómo |
|---|---|
| Deploy normal | Push/merge a `main` → `.github/workflows/deploy.yml` (Hosting + Functions: `api`, `zoneWatcher`, `snapshotJob`, `outcomeJob`) |
| Verificar | Corre solo `.github/workflows/smoke.yml` después de cada deploy: carga la web, llama a la API y resume en el job qué falta (Groq, FRED, versiones, alertas). También a mano: Actions → *Smoke test* → Run workflow |
| Cambiaste un secreto de Firebase | Actions → *Deploy to Firebase* → Run workflow (las funciones leen los secretos al iniciar) |
| Publicar índices y reglas de Firestore | El mismo *Run workflow* con `deploy_firestore` activado. **Probá `firestore.rules` en el emulador antes** |

## Secretos de GitHub requeridos
`FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`. El deploy los verifica antes de construir y falla con la lista de los que faltan.

## Secretos de Firebase (Functions)
`GROQ_API_KEY`, `FRED_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`:
```bash
printf '%s' 'VALOR' | firebase functions:secrets:set NOMBRE --data-file -   # sin salto de línea ni comillas
```
y después *Run workflow* del deploy. Diagnóstico: `/api/health/deep` (configuración y frescura) y `/api/health/ai` (prueba la clave de Groq).

## Notas del deploy
- El log muestra `409 … unable to queue the operation` al actualizar varias funciones a la vez: es un reintento normal, termina en "Successful update operation".
- `firebase-functions@5` da una advertencia de versión vieja: subir a la última es un cambio con rupturas posibles; no se hizo sin poder probar el deploy.
- `index.html` y los service workers se sirven sin caché (para que un deploy nuevo no quede tapado por una PWA vieja); `/assets/**` con caché larga e inmutable.
- Los permisos de la cuenta de servicio para `firestore:rules/indexes` (Firebase Rules Admin / Cloud Datastore Index Admin) hay que otorgarlos si querés usar `deploy_firestore`.
