import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BorrarConConfirmacion } from '../components/BorrarConConfirmacion';
import { Cabecera } from '../components/Cabecera';
import { PlacaDias } from '../components/PlazoVista';
import { opcionesConActual } from '../lib/candidaturas';
import { borrarElemento, guardarElemento, useAjustes, useColeccion } from '../lib/datos';
import { diasEntre, fechaCorta } from '../lib/fechas';
import { enlaceSeguro } from '../lib/plazos';
import { useSesion } from '../lib/sesion';
import { useHoy } from '../lib/useHoy';
import {
  aConvocatoria,
  CONJUNTA,
  ESTADOS,
  ETIQUETA_CONJUNTA,
  ETIQUETA_ESTADO,
  filtrarConvocatorias,
  ordenarConvocatorias,
  TIPOS_VIVIENDA,
  type Conjunta,
  type Convocatoria,
  type DatosConvocatoria,
  type EstadoConvocatoria,
  type TipoVivienda,
} from '../lib/vivienda';

const NUEVA = 'nueva';

const seAcabo = ({ estado }: Convocatoria) => estado === 'cerrada' || estado === 'sorteada';

/** La placa solo lleva cuentas atrás; sin una, queda el hueco para que las filas sigan alineadas. */
function PlacaConvocatoria({ convocatoria, hoy }: { convocatoria: Convocatoria; hoy: string }) {
  const dias = convocatoria.finPlazo ? diasEntre(hoy, convocatoria.finPlazo) : -1;
  return !seAcabo(convocatoria) && dias >= 0 ? <PlacaDias dias={dias} /> : <div className="placa-hueco" />;
}

function textoFinPlazo(c: Convocatoria, hoy: string) {
  if (!c.finPlazo) return 'Sin fecha de fin';
  const vencida = !seAcabo(c) && c.finPlazo < hoy;
  return `${vencida ? 'Plazo vencido' : 'Fin'}: ${fechaCorta(c.finPlazo)}`;
}

function Fila({
  convocatoria: c,
  hoy,
  onEditar,
  onBorrar,
}: {
  convocatoria: Convocatoria;
  hoy: string;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const enlace = enlaceSeguro(c.enlace);
  return (
    <li className="plazo">
      <PlacaConvocatoria convocatoria={c} hoy={hoy} />
      <div className="plazo__cuerpo">
        <p className="plazo__titulo">{c.promocion}</p>
        <p className="plazo__meta">
          <span>{c.municipio}</span>
          <span>{c.tipo}</span>
          <span className={`estado estado--${c.estado}`}>{ETIQUETA_ESTADO[c.estado]}</span>
          <span>{textoFinPlazo(c, hoy)}</span>
        </p>
      </div>
      <div className="plazo__acciones">
        <button type="button" className="boton boton--secundario" onClick={onEditar}>
          Editar
        </button>
        <BorrarConConfirmacion onBorrar={onBorrar} />
      </div>
      <div className="plazo__detalle">
        <p className="plazo__nota">Solicitud conjunta: {ETIQUETA_CONJUNTA[c.conjunta]}</p>
        {c.requisitos && <p className="plazo__nota">Requisitos: {c.requisitos}</p>}
        {c.notas && <p className="plazo__nota">{c.notas}</p>}
        {enlace && (
          <a className="enlace" href={enlace} target="_blank" rel="noopener noreferrer">
            Abrir enlace
          </a>
        )}
      </div>
    </li>
  );
}

function Formulario({
  inicial,
  municipios,
  onGuardar,
  onCancelar,
}: {
  inicial: DatosConvocatoria;
  municipios: string[];
  onGuardar: (datos: DatosConvocatoria) => void;
  onCancelar: () => void;
}) {
  const [municipio, setMunicipio] = useState(inicial.municipio || municipios[0] || '');
  const [promocion, setPromocion] = useState(inicial.promocion);
  const [tipo, setTipo] = useState<TipoVivienda>(inicial.tipo);
  const [estado, setEstado] = useState<EstadoConvocatoria>(inicial.estado);
  const [finPlazo, setFinPlazo] = useState(inicial.finPlazo ?? '');
  const [conjunta, setConjunta] = useState<Conjunta>(inicial.conjunta);
  const [requisitos, setRequisitos] = useState(inicial.requisitos);
  const [enlace, setEnlace] = useState(inicial.enlace);
  const [notas, setNotas] = useState(inicial.notas);
  const [errorEnlace, setErrorEnlace] = useState(false);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const enlaceLimpio = enlace.trim();
    if (enlaceLimpio && !enlaceSeguro(enlaceLimpio)) {
      setErrorEnlace(true);
      return;
    }
    onGuardar({
      municipio,
      promocion: promocion.trim(),
      tipo,
      estado,
      finPlazo: finPlazo || null,
      conjunta,
      requisitos: requisitos.trim(),
      enlace: enlaceLimpio,
      notas: notas.trim(),
    });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo formulario__ancho">
        <span>Promoción</span>
        <input required autoFocus value={promocion} onChange={(e) => setPromocion(e.target.value)} />
      </label>
      <label className="campo">
        <span>Municipio</span>
        <select required value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
          {opcionesConActual(municipios, inicial.municipio).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVivienda)}>
          {TIPOS_VIVIENDA.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Estado</span>
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoConvocatoria)}>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_ESTADO[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Fin de plazo</span>
        <input type="date" value={finPlazo} onChange={(e) => setFinPlazo(e.target.value)} />
      </label>
      <label className="campo">
        <span>¿Admite solicitud conjunta?</span>
        <select value={conjunta} onChange={(e) => setConjunta(e.target.value as Conjunta)}>
          {CONJUNTA.map((v) => (
            <option key={v} value={v}>
              {ETIQUETA_CONJUNTA[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
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
      <label className="campo formulario__ancho">
        <span>Requisitos</span>
        <textarea rows={2} value={requisitos} onChange={(e) => setRequisitos(e.target.value)} />
      </label>
      <label className="campo formulario__ancho">
        <span>Notas</span>
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
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

const VACIA: DatosConvocatoria = {
  municipio: '',
  promocion: '',
  tipo: 'VPO',
  estado: 'abierta',
  finPlazo: null,
  conjunta: 'nose',
  requisitos: '',
  enlace: '',
  notas: '',
};

export function Vivienda() {
  const uid = useSesion().usuario!.uid;
  const hoy = useHoy();
  const { estado, datos } = useColeccion(uid, 'vivienda', aConvocatoria);
  const ajustes = useAjustes(uid);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<EstadoConvocatoria | null>(null);

  const municipios = ajustes.datos.municipios;
  const sinMunicipios = ajustes.estado === 'listo' && municipios.length === 0;
  // Filtros: los de Ajustes más cualquier municipio ya usado en una convocatoria.
  const opcionesFiltro = [...new Set([...municipios, ...datos.map((c) => c.municipio)])];
  const visibles = ordenarConvocatorias(filtrarConvocatorias(datos, municipio, filtroEstado));

  function guardar(convocatoria: DatosConvocatoria, id?: string) {
    setError(null);
    setEditando(null);
    guardarElemento(uid, 'vivienda', convocatoria, id).catch(() =>
      setError('No se ha podido guardar la convocatoria. Vuelve a intentarlo.'),
    );
  }

  function borrar(id: string) {
    setError(null);
    borrarElemento(uid, 'vivienda', id).catch(() =>
      setError('No se ha podido borrar la convocatoria. Vuelve a intentarlo.'),
    );
  }

  return (
    <>
      <Cabecera
        titulo="Vivienda"
        accion={
          <button
            type="button"
            className="boton boton--principal"
            disabled={sinMunicipios}
            onClick={() => setEditando(NUEVA)}
          >
            Añadir convocatoria
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
          No se han podido cargar las convocatorias. Comprueba tu conexión y recarga la página.
        </p>
      )}
      {sinMunicipios && (
        <ul className="avisos">
          <li>
            Para añadir convocatorias, escribe primero tus municipios en{' '}
            <Link className="enlace" to="/ajustes">
              Ajustes
            </Link>
            .
          </li>
        </ul>
      )}

      {editando === NUEVA && (
        <div className="plazo-formulario plazo-formulario--alta">
          <Formulario
            inicial={VACIA}
            municipios={municipios}
            onGuardar={(d) => guardar(d)}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {datos.length > 0 && (
        <div className="filtros">
          <label className="campo campo--enLinea">
            <span>Municipio</span>
            <select value={municipio ?? ''} onChange={(e) => setMunicipio(e.target.value || null)}>
              <option value="">Todos</option>
              {opcionesFiltro.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="campo campo--enLinea">
            <span>Estado</span>
            <select
              value={filtroEstado ?? ''}
              onChange={(e) => setFiltroEstado((e.target.value || null) as EstadoConvocatoria | null)}
            >
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_ESTADO[s]}
                </option>
              ))}
            </select>
          </label>
          <p className="texto-pequeno" role="status">
            {visibles.length} de {datos.length}
          </p>
        </div>
      )}

      {estado === 'cargando' && (
        <div className="esqueleto" role="status" aria-label="Cargando las convocatorias">
          <div className="esqueleto__fila" />
          <div className="esqueleto__fila" />
        </div>
      )}
      {estado === 'listo' && datos.length === 0 && !sinMunicipios && (
        <p className="vacio">Todavía no hay convocatorias. Añade la primera con el botón de arriba.</p>
      )}
      {datos.length > 0 && visibles.length === 0 && (
        <p className="vacio">
          Ninguna convocatoria con estos filtros.{' '}
          <button
            type="button"
            className="enlace enlace--boton"
            onClick={() => {
              setMunicipio(null);
              setFiltroEstado(null);
            }}
          >
            Quitar los filtros
          </button>
        </p>
      )}

      {visibles.length > 0 && (
        <ul className="lista-plazos">
          {visibles.map((c) =>
            editando === c.id ? (
              <li key={c.id} className="plazo-formulario">
                <Formulario
                  inicial={c}
                  municipios={municipios}
                  onGuardar={(d) => guardar(d, c.id)}
                  onCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <Fila
                key={c.id}
                convocatoria={c}
                hoy={hoy}
                onEditar={() => setEditando(c.id)}
                onBorrar={() => borrar(c.id)}
              />
            ),
          )}
        </ul>
      )}
    </>
  );
}
