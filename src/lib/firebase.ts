import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function crearAuth(): Auth | null {
  if (Object.values(config).some((valor) => !valor)) return null;
  const app = getApps()[0] ?? initializeApp(config);
  // initializeAuth, sin popups ni redirecciones: no carga scripts ni iframes de
  // Google, y así la CSP puede ser estricta. La sesión persiste al cerrar.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return auth;
}

/** null si falta la configuración: la app lo avisa en vez de romperse. */
export const auth = crearAuth();
