import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BorrarConConfirmacion } from '../components/BorrarConConfirmacion';
import { Cabecera } from '../components/Cabecera';
import { ResumenPlazo } from '../components/PlazoVista';
import { borrarElemento, guardarElemento } from '../lib/datos';
import { fechaCorta } from '../lib/fechas';
import {
  CATEGORIAS,
  enlaceSeguro,
  esPlazoPropio,
  separarPlazos,
  type Categoria,
  type DatosPlazo,
  type PlazoListado,
} from '../lib/plazos';
import { useSesion } from '../lib/sesion';
import { useHoy } from '../lib/useHoy';
import { usePlazos } from '../lib/usePlazos';
import { EsqueletoPlazos } from './Inicio';

const VACIO = (hoy: string): DatosPlazo => ({
  titulo: '',
  fecha: hoy,
  categoria: 'Personal',
  nota: '',
  enlace: '',
});

export function Plazos() {
  const uid = useSesion().usuario!.uid;
  const hoy = useHoy();
  const { estado, datos } = usePlazos(uid);
  const { proximos, archivados } = separarPlazos(datos, hoy);
  // 'nuevo' para el alta; el id del plazo para la edición.
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Firestore aplica el cambio al momento y lo sincroniza después; sin red, la
  // promesa queda pendiente, así que el formulario no la espera para cerrarse.
  function guardar(datosPlazo: DatosPlazo, id?: string) {
    setError(null);
    setEditando(null);
    guardarElemento(uid, 'plazos', datosPlazo, id).catch(() =>
      setError('No se ha podido guardar el plazo. Vuelve a intentarlo.'),
    );
  }

  function borrar(id: string) {
    setError(null);
    borrarElemento(uid, 'plazos', id).catch(() =>
      setError('No se ha podido borrar el plazo. Vuelve a intentarlo.'),
    );
  }

  const fila = (plazo: PlazoListado, archivado = false) =>
    esPlazoPropio(plazo) && editando === plazo.id ? (
      <li key={plazo.id} className="plazo-formulario">
        <FormularioPlazo
          inicial={plazo}
          onGuardar={(d) => guardar(d, plazo.id)}
          onCancelar={() => setEditando(null)}
        />
      </li>
    ) : (
      <FilaPlazo
        key={plazo.id}
        plazo={plazo}
        hoy={hoy}
        archivado={archivado}
        onEditar={() => setEditando(plazo.id)}
        onBorrar={() => borrar(plazo.id)}
      />
    );

  return (
    <>
      <Cabecera
        titulo="Plazos"
        accion={
          <button
            type="button"
            className="boton boton--principal"
            onClick={() => setEditando('nuevo')}
          >
            Añadir plazo
          </button>
        }
      />

      {error && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          {error}
        </p>
      )}
      {estado === 'error' && (
        <p className="aviso-error aviso-error--pagina" role="alert">
          No se han podido cargar los plazos. Comprueba tu conexión y recarga la página.
        </p>
      )}

      {editando === 'nuevo' && (
        <div className="plazo-formulario plazo-formulario--alta">
          <FormularioPlazo
            inicial={VACIO(hoy)}
            onGuardar={(d) => guardar(d)}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {estado === 'cargando' && <EsqueletoPlazos />}

      {estado === 'listo' && proximos.length === 0 && archivados.length > 0 && (
        <p className="vacio">No tienes plazos próximos.</p>
      )}
      {estado === 'listo' && datos.length === 0 && (
        <p className="vacio">
          Todavía no hay plazos. Añade el primero o importa tu copia desde{' '}
          <Link className="enlace" to="/ajustes">
            Ajustes
          </Link>
          .
        </p>
      )}

      {proximos.length > 0 && <ul className="lista-plazos">{proximos.map((p) => fila(p))}</ul>}

      {archivados.length > 0 && (
        <details className="archivados">
          <summary>Archivados ({archivados.length})</summary>
          <ul className="lista-plazos">{archivados.map((p) => fila(p, true))}</ul>
        </details>
      )}
    </>
  );
}

function FilaPlazo({
  plazo,
  hoy,
  archivado,
  onEditar,
  onBorrar,
}: {
  plazo: PlazoListado;
  hoy: string;
  archivado: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const enlace = enlaceSeguro(plazo.enlace);
  return (
    <li className={archivado ? 'plazo plazo--archivado' : 'plazo'}>
      {archivado ? (
        <div className="plazo__cuerpo">
          <p className="plazo__titulo">{plazo.titulo}</p>
          <p className="plazo__meta">
            <time dateTime={plazo.fecha}>{fechaCorta(plazo.fecha)}</time>
            <span>{plazo.categoria}</span>
          </p>
        </div>
      ) : (
        <ResumenPlazo plazo={plazo} hoy={hoy} />
      )}
      <div className="plazo__acciones">
        {esPlazoPropio(plazo) ? (
          <>
            <button type="button" className="boton boton--secundario" onClick={onEditar}>
              Editar
            </button>
            <BorrarConConfirmacion onBorrar={onBorrar} />
          </>
        ) : (
          <Link className="enlace" to="/vivienda">
            Ver en Vivienda
          </Link>
        )}
      </div>
      {(plazo.nota || enlace) && (
        <div className="plazo__detalle">
          {plazo.nota && <p className="plazo__nota">{plazo.nota}</p>}
          {enlace && (
            <a className="enlace" href={enlace} target="_blank" rel="noopener noreferrer">
              Abrir enlace
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function FormularioPlazo({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: DatosPlazo;
  onGuardar: (datos: DatosPlazo) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [categoria, setCategoria] = useState<Categoria>(inicial.categoria);
  const [nota, setNota] = useState(inicial.nota);
  const [enlace, setEnlace] = useState(inicial.enlace);
  const [errorEnlace, setErrorEnlace] = useState(false);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const enlaceLimpio = enlace.trim();
    if (enlaceLimpio && !enlaceSeguro(enlaceLimpio)) {
      setErrorEnlace(true);
      return;
    }
    onGuardar({ titulo: titulo.trim(), fecha, categoria, nota: nota.trim(), enlace: enlaceLimpio });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo formulario__ancho">
        <span>Título</span>
        <input required autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="campo">
        <span>Fecha</span>
        <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        <span>Categoría</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="campo formulario__ancho">
        <span>Nota</span>
        <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
      <label className="campo formulario__ancho">
        <span>Enlace</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://"
          aria-invalid={errorEnlace}
          value={enlace}
          onChange={(e) => {
            setEnlace(e.target.value);
            setErrorEnlace(false);
          }}
        />
      </label>
      {errorEnlace && (
        <p className="aviso-error formulario__ancho" role="alert">
          El enlace debe empezar por http:// o https://.
        </p>
      )}
      <div className="formulario__acciones formulario__ancho">
        <button className="boton boton--principal">Guardar</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
