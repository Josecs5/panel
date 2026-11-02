import { Navigate, Route, Routes } from 'react-router-dom';
import { LimiteDeError } from './components/LimiteDeError';
import { Marco } from './components/Marco';
import { useSesion } from './lib/sesion';
import { Ajustes } from './pages/Ajustes';
import { Candidaturas } from './pages/Candidaturas';
import { Cartera } from './pages/Cartera';
import { Inicio } from './pages/Inicio';
import { Login } from './pages/Login';
import { Plazos } from './pages/Plazos';
import { Prompts } from './pages/Prompts';
import { Vivienda } from './pages/Vivienda';

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
          <Route path="/" element={<Inicio />} />
          <Route path="/plazos" element={<Plazos />} />
          <Route path="/cartera" element={<Cartera />} />
          <Route path="/vivienda" element={<Vivienda />} />
          <Route path="/candidaturas" element={<Candidaturas />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </LimiteDeError>
    </Marco>
  );
}
