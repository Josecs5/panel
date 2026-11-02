import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSesion } from '../lib/sesion';
import { Icono, type NombreIcono } from './Icono';

const SECCIONES: { ruta: string; nombre: string; icono: NombreIcono }[] = [
  { ruta: '/', nombre: 'Inicio', icono: 'inicio' },
  { ruta: '/plazos', nombre: 'Plazos', icono: 'plazos' },
  { ruta: '/cartera', nombre: 'Cartera', icono: 'cartera' },
  { ruta: '/vivienda', nombre: 'Vivienda', icono: 'vivienda' },
  { ruta: '/candidaturas', nombre: 'Candidaturas', icono: 'candidaturas' },
  { ruta: '/prompts', nombre: 'Prompts', icono: 'prompts' },
  { ruta: '/ajustes', nombre: 'Ajustes', icono: 'ajustes' },
];

// En el móvil, Ajustes y Cerrar sesión van arriba: abajo solo caben seis secciones.
const SECCIONES_BARRA = SECCIONES.filter(({ ruta }) => ruta !== '/ajustes');

const claseDeEnlace =
  (base: string) =>
  ({ isActive }: { isActive: boolean }) =>
    isActive ? `${base} ${base}--activo` : base;

export function Marco({ children }: { children: ReactNode }) {
  const { cerrarSesion } = useSesion();
  const { pathname } = useLocation();

  // Cada sección empieza arriba, aunque la anterior se hubiera quedado a media página.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
