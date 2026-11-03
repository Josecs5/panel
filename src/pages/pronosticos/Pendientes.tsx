import { useState, type FormEvent } from 'react';
import { guardarElemento } from '../../lib/datos';
import {
  CAMPOS_ESTADISTICA_CL,
  ESTADISTICAS,
  NOMBRE_ESTADISTICA,
  PREGUNTA_CATEGORIA,
  aDatosEstadisticasCL,
  fechaHora,
  type Comprobacion,
  type Partido,
  type PreguntaJugador,
} from '../../lib/pronosticos';
import { useSesion } from '../../lib/sesion';
import { usePendientes } from '../../lib/usePronosticos';

const NOTA = 'Se liquida en la próxima ejecución diaria, cada mañana.';

function FormularioEstadisticas({ partido }: { partido: Partido }) {
  const uid = useSesion().usuario!.uid;
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const datos = Object.fromEntries(CAMPOS_ESTADISTICA_CL.map((c) => [c, Number(valores[c] ?? '')]));
    const validos = aDatosEstadisticasCL(datos);
    if (!validos || CAMPOS_ESTADISTICA_CL.some((c) => (valores[c] ?? '') === '')) {
      setError('Rellena todas las casillas con números enteros.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await guardarElemento(uid, 'pronEstadisticasCL', validos, partido.id);
    } catch {
      setError('No se han podido guardar. Vuelve a intentarlo.');
      setGuardando(false);
    }
  }

  return (
    <form className="pendiente__formulario" onSubmit={enviar}>
      <h4 className="jugadores__titulo">Estadísticas del partido</h4>
      <div className="estadisticas-cl" role="group" aria-label={`Estadísticas de ${partido.local} y ${partido.visitante}`}>
        <span />
        <span className="texto-pequeno">{partido.local}</span>
        <span className="texto-pequeno">{partido.visitante}</span>
        {ESTADISTICAS.map((nombre) => (
          <div key={nombre} className="estadisticas-cl__fila">
            <span>{NOMBRE_ESTADISTICA[nombre]}</span>
            {(['l', 'v'] as const).map((lado) => {
              const campo = `${nombre}_${lado}`;
              return (
                <label key={campo} className="campo">
                  <span className="oculto">
                    {NOMBRE_ESTADISTICA[nombre]} de {lado === 'l' ? partido.local : partido.visitante}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    required
                    value={valores[campo] ?? ''}
                    onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                  />
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <div className="formulario__acciones">
        <button className="boton boton--principal boton--peq" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar estadísticas'}
        </button>
        <p className="texto-pequeno">{NOTA}</p>
      </div>
      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Comprobaciones({
  partido,
  preguntas,
  previa,
}: {
  partido: Partido;
  preguntas: PreguntaJugador[];
  previa?: Comprobacion;
}) {
  const uid = useSesion().usuario!.uid;
  const [respuestas, setRespuestas] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const contestadas = Object.keys(respuestas).length;

  async function guardar() {
    setError(false);
    setGuardando(true);
    try {
      await guardarElemento(uid, 'pronComprobaciones', { respuestas: { ...previa?.respuestas, ...respuestas } }, partido.id);
      setRespuestas({});
    } catch {
      setError(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pendiente__formulario">
      <h4 className="jugadores__titulo">Comprobación de jugadores</h4>
      <ul className="preguntas">
        {preguntas.map((p) => (
          <li key={p.clave} className="pregunta">
            <span>
              <strong>{p.jugador}</strong> {PREGUNTA_CATEGORIA[p.categoria]}
            </span>
            <span className="etiquetas" role="group" aria-label={`${p.jugador}: ${PREGUNTA_CATEGORIA[p.categoria]}`}>
              {[true, false].map((valor) => (
                <button
                  key={String(valor)}
                  type="button"
                  className="etiqueta"
                  aria-pressed={respuestas[p.clave] === valor}
                  onClick={() => setRespuestas({ ...respuestas, [p.clave]: valor })}
                >
                  {valor ? 'Sí' : 'No'}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="formulario__acciones">
        <button type="button" className="boton boton--principal boton--peq" disabled={guardando || contestadas === 0} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar respuestas'}
        </button>
        <p className="texto-pequeno">{NOTA}</p>
      </div>
      {error && (
        <p className="aviso-error" role="alert">
          No se han podido guardar. Vuelve a intentarlo.
        </p>
      )}
    </div>
  );
}

export function Pendientes() {
  const uid = useSesion().usuario!.uid;
  const { estado, pendientes, comprobaciones } = usePendientes(uid);

  if (estado === 'error') {
    return (
      <p className="aviso-error" role="alert">
        No se han podido cargar los pendientes. Comprueba tu conexión y recarga la página.
      </p>
    );
  }
  if (estado === 'cargando') return <div className="esqueleto__fila" role="status" aria-label="Cargando los pendientes" />;
  if (pendientes.length === 0) {
    return (
      <p className="vacio">
        No tienes nada por rellenar. Aquí aparecerán las estadísticas de los partidos de Champions y las comprobaciones
        de jugadores cuando termine cada partido congelado.
      </p>
    );
  }

  return (
    <ul className="pendientes">
      {pendientes.map(({ partido, faltanEstadisticas, preguntas }) => (
        <li key={partido.id} className="partido">
          <header className="partido__cabecera">
            <h2 className="partido__titulo">
              {partido.local} <span className="texto-suave">-</span> {partido.visitante}
            </h2>
            <p className="texto-pequeno">{fechaHora(partido.inicio)}</p>
          </header>
          {faltanEstadisticas && <FormularioEstadisticas partido={partido} />}
          {preguntas.length > 0 && (
            <Comprobaciones
              partido={partido}
              preguntas={preguntas}
              previa={comprobaciones.find((c) => c.id === partido.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
