import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LimiteDeError } from './components/LimiteDeError';
import { Marco, SECCIONES } from './components/Marco';
import { useSesion } from './lib/sesion';
import { Ajustes } from './pages/Ajustes';
import { Inicio } from './pages/Inicio';
import { Login } from './pages/Login';
import { Plazos } from './pages/Plazos';
import { SeccionPendiente } from './pages/SeccionPendiente';

const PAGINAS: Record<string, ReactElement> = {
  '/': <Inicio />,
  '/plazos': <Plazos />,
  '/ajustes': <Ajustes />,
};

export default function App() {
  const { cargando, usuario } = useSesion();

  // Sin sesión no se monta ninguna ruta: lo único que existe es el login.
  if (cargando) {
    return (
      <main className="acceso">
        <p className="acceso__marca">Panel</p>
        <p className="acceso__estado" role="status">
          Comprobando la sesión…
        </p>
      </main>
    );
  }
  if (!usuario) return <Login />;

  return (
    <Marco>
      <LimiteDeError>
        <Routes>
          {SECCIONES.map(({ ruta, nombre, fase }) => (
            <Route
              key={ruta}
              path={ruta}
              element={PAGINAS[ruta] ?? <SeccionPendiente nombre={nombre} fase={fase} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </LimiteDeError>
    </Marco>
  );
}
