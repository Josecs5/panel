import { Navigate, Route, Routes } from 'react-router-dom';
import { Marco, SECCIONES } from './components/Marco';
import { useSesion } from './lib/sesion';
import { Login } from './pages/Login';
import { SeccionPendiente } from './pages/SeccionPendiente';

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
      <Routes>
        {SECCIONES.map(({ ruta, nombre, fase }) => (
          <Route key={ruta} path={ruta} element={<SeccionPendiente nombre={nombre} fase={fase} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
