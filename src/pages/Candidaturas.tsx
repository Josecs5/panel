import { useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BorrarConConfirmacion } from '../components/BorrarConConfirmacion';
import { Cabecera } from '../components/Cabecera';
import {
  aCandidatura,
  AREA_OTRA,
  estaBajoMinimo,
  ETIQUETA_FASE,
  FASES,
  MODALIDADES,
  opcionesConActual,
  type Candidatura,
  type DatosCandidatura,
  type Fase,
} from '../lib/candidaturas';
import { borrarElemento, guardarElemento, useAjustes, useColeccion } from '../lib/datos';
import { fechaCorta } from '../lib/fechas';
import { moneda } from '../lib/formato';
import { enlaceSeguro } from '../lib/plazos';
import { useSesion } from '../lib/sesion';
import { useHoy } from '../lib/useHoy';

const NUEVA = 'nueva';

const sinId = ({ id: _id, ...datos }: Candidatura): DatosCandidatura => datos;

function Tarjeta({
  candidatura: c,
  minimo,
  onEditar,
  onCambiarFase,
}: {
  candidatura: Candidatura;
  minimo: number | null;
  onEditar: () => void;
  onCambiarFase: (fase: Fase) => void;
}) {
  const bajo = estaBajoMinimo(c.salario, minimo);
  const enlace = enlaceSeguro(c.enlace);
  const detalle = [c.area, c.modalidad].filter(Boolean).join(' · ');

  function empezarArrastre(evento: DragEvent) {
    evento.dataTransfer.setData('text/plain', c.id);
    evento.dataTransfer.effectAllowed = 'move';
  }

  return (
    <li className={bajo ? 'tarjeta tarjeta--baja' : 'tarjeta'} draggable onDragStart={empezarArrastre}>
      <p className="tarjeta__empresa">{c.empresa}</p>
      <p className="tarjeta__puesto">{c.puesto}</p>
      {detalle && <p className="texto-pequeno">{detalle}</p>}
      {c.salario !== null && (
        <p className={bajo ? 'tarjeta__salario tarjeta__salario--bajo' : 'tarjeta__salario'}>
          {moneda(c.salario)}
          {bajo && <span className="tarjeta__aviso">Por debajo de tu mínimo</span>}
        </p>
      )}
      {c.proximoPaso && (
        <p className="tarjeta__paso">
          {c.proximoPaso}
          {c.proximoPasoFecha && <span className="texto-pequeno"> · {fechaCorta(c.proximoPasoFecha)}</span>}
        </p>
      )}
      {enlace && (
        <a className="enlace tarjeta__enlace" href={enlace} target="_blank" rel="noopener noreferrer">
          Abrir oferta
        </a>
      )}
      <label className="campo tarjeta__fase">
        <span>Fase</span>
        <select value={c.fase} onChange={(e) => onCambiarFase(e.target.value as Fase)}>
          {FASES.map((f) => (
            <option key={f} value={f}>
              {ETIQUETA_FASE[f]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="boton boton--secundario boton--peq tarjeta__editar"
        aria-label={`Editar ${c.empresa}`}
        onClick={onEditar}
      >
        Editar
      </button>
    </li>
  );
}

function Columna({
  fase,
  candidaturas,
  minimo,
  onEditar,
  onCambiarFase,
  onSoltar,
}: {
  fase: Fase;
  candidaturas: Candidatura[];
  minimo: number | null;
  onEditar: (id: string) => void;
  onCambiarFase: (candidatura: Candidatura, fase: Fase) => void;
  onSoltar: (id: string, fase: Fase) => void;
}) {
  const [encima, setEncima] = useState(false);

  return (
    <section
      className={encima ? 'columna columna--encima' : 'columna'}
      aria-label={ETIQUETA_FASE[fase]}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setEncima(true);
      }}
      onDragLeave={(e) => {
        // Solo al salir de la columna, no al pasar sobre sus tarjetas.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        onSoltar(e.dataTransfer.getData('text/plain'), fase);
      }}
    >
      <h2 className="columna__titulo">
        {ETIQUETA_FASE[fase]} <span className="columna__numero">{candidaturas.length}</span>
      </h2>
      {candidaturas.length === 0 ? (
        <p className="columna__vacia">Sin candidaturas</p>
      ) : (
        <ul className="columna__lista">
          {candidaturas.map((c) => (
            <Tarjeta
              key={c.id}
              candidatura={c}
              minimo={minimo}
              onEditar={() => onEditar(c.id)}
              onCambiarFase={(f) => onCambiarFase(c, f)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Formulario({
  inicial,
  areas,
  onGuardar,
  onCancelar,
  onBorrar,
}: {
  inicial: DatosCandidatura;
  areas: string[];
  onGuardar: (datos: DatosCandidatura) => void;
  onCancelar: () => void;
  onBorrar?: () => void;
}) {
  const [empresa, setEmpresa] = useState(inicial.empresa);
  const [puesto, setPuesto] = useState(inicial.puesto);
  const [area, setArea] = useState(inicial.area || areas[0] || AREA_OTRA);
  const [modalidad, setModalidad] = useState(inicial.modalidad);
  const [salario, setSalario] = useState(inicial.salario === null ? '' : String(inicial.salario));
  const [fecha, setFecha] = useState(inicial.fecha ?? '');
  const [proximoPaso, setProximoPaso] = useState(inicial.proximoPaso);
  const [proximoPasoFecha, setProximoPasoFecha] = useState(inicial.proximoPasoFecha ?? '');
  const [enlace, setEnlace] = useState(inicial.enlace);
  const [contacto, setContacto] = useState(inicial.contacto);
  const [notas, setNotas] = useState(inicial.notas);
  const [fase, setFase] = useState<Fase>(inicial.fase);
  const [errorEnlace, setErrorEnlace] = useState(false);
  const opcionesArea = opcionesConActual([...areas.filter((a) => a !== AREA_OTRA), AREA_OTRA], inicial.area);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const enlaceLimpio = enlace.trim();
    if (enlaceLimpio && !enlaceSeguro(enlaceLimpio)) {
      setErrorEnlace(true);
      return;
    }
    onGuardar({
      empresa: empresa.trim(),
      puesto: puesto.trim(),
      area,
      modalidad,
      salario: salario.trim() === '' ? null : Number(salario),
      fecha: fecha || null,
      proximoPaso: proximoPaso.trim(),
      proximoPasoFecha: proximoPasoFecha || null,
      enlace: enlaceLimpio,
      contacto: contacto.trim(),
      notas: notas.trim(),
      fase,
    });
  }

  return (
    <form className="formulario formulario--tres" onSubmit={enviar}>
      <label className="campo">
        <span>Empresa</span>
        <input required autoFocus value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
      </label>
      <label className="campo">
        <span>Puesto</span>
        <input required value={puesto} onChange={(e) => setPuesto(e.target.value)} />
      </label>
      <label className="campo">
        <span>Fase</span>
        <select value={fase} onChange={(e) => setFase(e.target.value as Fase)}>
          {FASES.map((f) => (
            <option key={f} value={f}>
              {ETIQUETA_FASE[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Área</span>
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          {opcionesArea.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Modalidad</span>
        <select value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
          <option value="">Sin indicar</option>
          {opcionesConActual([...MODALIDADES], inicial.modalidad).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Salario ofrecido (€)</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={salario}
          onChange={(e) => setSalario(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Fecha</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        <span>Próximo paso</span>
        <input value={proximoPaso} onChange={(e) => setProximoPaso(e.target.value)} />
      </label>
      <label className="campo">
        <span>Fecha del próximo paso</span>
        <input type="date" value={proximoPasoFecha} onChange={(e) => setProximoPasoFecha(e.target.value)} />
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
      <label className="campo formulario__doble">
        <span>Contacto</span>
        <input value={contacto} onChange={(e) => setContacto(e.target.value)} />
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
        {onBorrar && (
          <span className="formulario__borrar">
            <BorrarConConfirmacion onBorrar={onBorrar} />
          </span>
        )}
      </div>
    </form>
  );
}

export function Candidaturas() {
  const uid = useSesion().usuario!.uid;
  const hoy = useHoy();
  const { estado, datos } = useColeccion(uid, 'candidaturas', aCandidatura);
  const ajustes = useAjustes(uid);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function guardar(candidatura: DatosCandidatura, id?: string) {
    setError(null);
    setEditando(null);
    guardarElemento(uid, 'candidaturas', candidatura, id).catch(() =>
      setError('No se ha podido guardar la candidatura. Vuelve a intentarlo.'),
    );
  }

  function cambiarFase(candidatura: Candidatura, fase: Fase) {
    if (candidatura.fase === fase) return;
    setError(null);
    guardarElemento(uid, 'candidaturas', { ...sinId(candidatura), fase }, candidatura.id).catch(() =>
      setError('No se ha podido cambiar la fase. Vuelve a intentarlo.'),
    );
  }

  function soltar(id: string, fase: Fase) {
    const candidatura = datos.find((c) => c.id === id);
    if (candidatura) cambiarFase(candidatura, fase);
  }

  const enEdicion = datos.find((c) => c.id === editando);
  const ordenadas = [...datos].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));

  return (
    <>
      <Cabecera
        titulo="Candidaturas"
        accion={
          <button type="button" className="boton boton--principal" onClick={() => setEditando(NUEVA)}>
            Añadir candidatura
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
          No se han podido cargar las candidaturas. Comprueba tu conexión y recarga la página.
        </p>
      )}
      {ajustes.estado === 'listo' && ajustes.datos.areas.length === 0 && (
        <ul className="avisos">
          <li>
            Escribe tus áreas en{' '}
            <Link className="enlace" to="/ajustes">
              Ajustes
            </Link>{' '}
            para poder elegirlas; mientras tanto solo está disponible "{AREA_OTRA}".
          </li>
        </ul>
      )}

      {editando === NUEVA && (
        <div className="plazo-formulario plazo-formulario--alta">
          <Formulario
            inicial={{
              empresa: '',
              puesto: '',
              area: '',
              modalidad: '',
              salario: null,
              fecha: hoy,
              proximoPaso: '',
              proximoPasoFecha: null,
              enlace: '',
              contacto: '',
              notas: '',
              fase: 'por-enviar',
            }}
            areas={ajustes.datos.areas}
            onGuardar={(d) => guardar(d)}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}
      {enEdicion && (
        <div className="plazo-formulario plazo-formulario--alta" key={enEdicion.id}>
          <Formulario
            inicial={enEdicion}
            areas={ajustes.datos.areas}
            onGuardar={(d) => guardar(d, enEdicion.id)}
            onCancelar={() => setEditando(null)}
            onBorrar={() => {
              setEditando(null);
              borrarElemento(uid, 'candidaturas', enEdicion.id).catch(() =>
                setError('No se ha podido borrar la candidatura. Vuelve a intentarlo.'),
              );
            }}
          />
        </div>
      )}

      {estado === 'cargando' ? (
        <div className="esqueleto" role="status" aria-label="Cargando las candidaturas">
          <div className="esqueleto__fila" />
          <div className="esqueleto__fila" />
        </div>
      ) : (
        <>
          {estado === 'listo' && datos.length === 0 && (
            <p className="vacio tablero__vacio">
              Todavía no hay candidaturas. Añade la primera y arrástrala de fase a medida que avance.
            </p>
          )}
          <div className="tablero">
            {FASES.map((fase) => (
              <Columna
                key={fase}
                fase={fase}
                candidaturas={ordenadas.filter((c) => c.fase === fase)}
                minimo={ajustes.datos.salarioMinimo}
                onEditar={setEditando}
                onCambiarFase={cambiarFase}
                onSoltar={soltar}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
