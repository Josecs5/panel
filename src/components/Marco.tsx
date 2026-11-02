import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { Icono, type NombreIcono } from './Icono';

export const SECCIONES: { ruta: string; nombre: string; icono: NombreIcono; fase: number }[] = [
  { ruta: '/', nombre: 'Inicio', icono: 'inicio', fase: 2 },
  { ruta: '/plazos', nombre: 'Plazos', icono: 'plazos', fase: 2 },
  { ruta: '/cartera', nombre: 'Cartera', icono: 'cartera', fase: 3 },
  { ruta: '/vivienda', nombre: 'Vivienda', icono: 'vivienda', fase: 4 },
  { ruta: '/candidaturas', nombre: 'Candidaturas', icono: 'candidaturas', fase: 4 },
  { ruta: '/prompts', nombre: 'Prompts', icono: 'prompts', fase: 4 },
  { ruta: '/ajustes', nombre: 'Ajustes', icono: 'ajustes', fase: 2 },
];

// En el móvil, Ajustes y Cerrar sesión van arriba: abajo solo caben seis secciones.
const SECCIONES_BARRA = SECCIONES.filter(({ ruta }) => ruta !== '/ajustes');

const claseDeEnlace =
  (base: string) =>
  ({ isActive }: { isActive: boolean }) =>
    isActive ? `${base} ${base}--activo` : base;

export function Marco({ children }: { children: ReactNode }) {
  const { cerrarSesion } = useSesion();

  return (
    <div className="marco">
      <aside className="menu">
        <p className="menu__marca">Panel</p>
        <nav aria-label="Secciones">
          <ul className="menu__lista">
            {SECCIONES.map(({ ruta, nombre, icono }) => (
              <li key={ruta}>
                <NavLink to={ruta} end={ruta === '/'} className={claseDeEnlace('menu__enlace')}>
                  <Icono nombre={icono} />
                  {nombre}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button className="menu__enlace menu__salir" onClick={cerrarSesion}>
          <Icono nombre="salir" />
          Cerrar sesión
        </button>
      </aside>

      <header className="superior">
        <p className="superior__marca">Panel</p>
        <NavLink to="/ajustes" aria-label="Ajustes" className={claseDeEnlace('superior__accion')}>
          <Icono nombre="ajustes" />
        </NavLink>
        <button className="superior__accion" aria-label="Cerrar sesión" onClick={cerrarSesion}>
          <Icono nombre="salir" />
        </button>
      </header>

      <main className="pagina">{children}</main>

      <nav className="barra" aria-label="Secciones">
        {SECCIONES_BARRA.map(({ ruta, nombre, icono }) => (
          <NavLink key={ruta} to={ruta} end={ruta === '/'} className={claseDeEnlace('barra__enlace')}>
            <Icono nombre={icono} />
            {nombre}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
