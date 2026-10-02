# Despliegue (Firebase)

**Todo corre en Firebase** — `https://pal-crypto.web.app` / `https://pal-crypto.firebaseapp.com`: Hosting sirve el frontend (`frontend/dist`) y reescribe `/api/**` a la Cloud Function `api` (`us-central1`).
Netlify y Render **ya no se usan** y se eliminaron del repo (incluido `backend/`). Si todavía tenés el sitio de Netlify o el servicio de Render, borralos desde sus paneles.

## Flujo
| Qué | Cómo |
|---|---|
| Deploy normal | Push/merge a `main` → `.github/workflows/deploy.yml` (Hosting + Functions: `api`, `zoneWatcher`, `snapshotJob`, `outcomeJob`) |
| Verificar | Corre solo `.github/workflows/smoke.yml` después de cada deploy: carga la web, llama a la API y resume en el job qué falta (Groq, FRED, versiones, alertas). También a mano: Actions → *Smoke test* → Run workflow |
| Noticias | `.github/workflows/news-relay.yml` (cada 30 min y a mano) trae los feeds desde GitHub Actions y los guarda en Firestore (`_ai_cache/headlines_relay_*`). Motivo: los mismos feeds dan ~14 titulares desde Actions/Render y ~1 desde Cloud Functions (limitan IPs de Google Cloud). La API usa el relé cuando sus consultas devuelven menos de 3. Los cron de Actions solo corren desde `main`: la primera vez, correlo a mano (*Run workflow*) |
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

## Checklist después de cada deploy (resumen del *Smoke test*)
Debería decir: ✅ Web · ✅ API · ✅ Groq (la clave funciona) · versiones `p3 / p3 / p3-1` · ✅ COT desde la función · "Contexto de oro … faltan: nada" · Noticias 9/9 · Métricas PAXG con 200 · y **ningún aviso de calendario**. Si algo falla: `/api/health/deep` (config y frescura), `/api/health/ai`, `/api/health/news`, `/api/health/cot`.

**Ojo con el cron:** GitHub desactiva los workflows programados (*News relay*) tras 60 días sin actividad en el repo. Si las noticias o el COT dejan de actualizarse, revisá Actions → *News relay* y reactivalo.

