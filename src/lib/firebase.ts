import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const USA_EMULADORES = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';

function crearApp(): FirebaseApp | null {
  if (Object.values(config).some((valor) => !valor)) return null;
  return getApps()[0] ?? initializeApp(config);
}

function crearAuth(app: FirebaseApp): Auth {
  // initializeAuth, sin popups ni redirecciones: no carga scripts ni iframes de
  // Google, y así la CSP puede ser estricta. La sesión persiste al cerrar.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  if (USA_EMULADORES) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}

function crearFirestore(app: FirebaseApp): Firestore {
  const db = getFirestore(app);
  if (USA_EMULADORES) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return db;
}

const app = crearApp();

/** null si falta la configuración: la app lo avisa en vez de romperse. */
export const auth = app && crearAuth(app);
export const db = app && crearFirestore(app);
