import { NavLink, Route, Routes } from 'react-router-dom';
import { Cabecera } from '../components/Cabecera';
import { useSesion } from '../lib/sesion';
import { usePendientes } from '../lib/usePronosticos';
import { AjustesModulo } from './pronosticos/AjustesModulo';
import { Auditoria } from './pronosticos/Auditoria';
import { BoletoVista } from './pronosticos/BoletoVista';
import { EstaJornada } from './pronosticos/EstaJornada';
import { Historial } from './pronosticos/Historial';
import { Pendientes } from './pronosticos/Pendientes';

const VISTAS = [
  { ruta: '', nombre: 'Esta jornada' },
  { ruta: 'boleto', nombre: 'Boleto' },
  { ruta: 'historial', nombre: 'Historial' },
  { ruta: 'auditoria', nombre: 'Auditoría' },
  { ruta: 'pendientes', nombre: 'Pendientes' },
  { ruta: 'ajustes', nombre: 'Ajustes' },
];

export function Pronosticos() {
  const uid = useSesion().usuario!.uid;
  const { pendientes } = usePendientes(uid);

  return (
    <>
      <Cabecera titulo="Pronósticos" />
      <nav className="etiquetas pestanas" aria-label="Vistas de Pronósticos">
        {VISTAS.map(({ ruta, nombre }) => (
          <NavLink key={ruta} to={`/pronosticos/${ruta}`} end className="etiqueta">
            {nombre}
            {ruta === 'pendientes' && pendientes.length > 0 && ` (${pendientes.length})`}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<EstaJornada />} />
        <Route path="boleto" element={<BoletoVista />} />
        <Route path="historial" element={<Historial />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="pendientes" element={<Pendientes />} />
        <Route path="ajustes" element={<AjustesModulo />} />
        <Route path="*" element={<EstaJornada />} />
      </Routes>
    </>
  );
}
