import { Link } from 'react-router-dom';
import { Cabecera } from '../components/Cabecera';
import { ResumenPlazo } from '../components/PlazoVista';
import { useColeccion } from '../lib/datos';
import { aPlazo, separarPlazos } from '../lib/plazos';
import { useSesion } from '../lib/sesion';
import { useHoy } from '../lib/useHoy';

const PENDIENTES = [
  { titulo: 'Cartera', fase: 3 },
  { titulo: 'Mercado de EE. UU.', fase: 3 },
  { titulo: 'Vivienda', fase: 4 },
  { titulo: 'Candidaturas', fase: 4 },
];

export function Inicio() {
  const uid = useSesion().usuario!.uid;
  const hoy = useHoy();
  const { estado, datos } = useColeccion(uid, 'plazos', aPlazo);
  const proximos = separarPlazos(datos, hoy).proximos.slice(0, 5);

  return (
    <>
      <Cabecera titulo="Inicio" />
      <div className="inicio">
        <section aria-labelledby="inicio-plazos">
          <div className="seccion__titulo">
            <h2 id="inicio-plazos">Próximos plazos</h2>
            <Link className="enlace" to="/plazos">
              Ver todos
            </Link>
          </div>
          {estado === 'error' && (
            <p className="aviso-error" role="alert">
              No se han podido cargar los plazos. Comprueba tu conexión y recarga la página.
            </p>
          )}
          {estado === 'cargando' && <EsqueletoPlazos />}
          {estado === 'listo' && proximos.length === 0 && (
            <p className="vacio">
              No tienes plazos próximos. <Link className="enlace" to="/plazos">Añade uno</Link> o
              importa tu copia desde <Link className="enlace" to="/ajustes">Ajustes</Link>.
            </p>
          )}
          {proximos.length > 0 && (
            <ul className="lista-plazos">
              {proximos.map((plazo) => (
                <li key={plazo.id} className="plazo plazo--resumen">
                  <ResumenPlazo plazo={plazo} hoy={hoy} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="inicio__lateral">
          {PENDIENTES.map(({ titulo, fase }) => (
            <section key={titulo} className="bloque">
              <h2>{titulo}</h2>
              <p className="texto-suave">Se activa en la fase {fase}.</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function EsqueletoPlazos() {
  return (
    <div className="esqueleto" role="status" aria-label="Cargando los plazos">
      {[0, 1, 2].map((i) => (
        <div key={i} className="esqueleto__fila" />
      ))}
    </div>
  );
}
