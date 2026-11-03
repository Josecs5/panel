import { useMemo, useState, type ChangeEvent } from 'react';
import { BorrarConConfirmacion } from './BorrarConConfirmacion';
import { borrarElemento, guardarElemento, useColeccion, useProceso } from '../lib/datos';
import { aImportacion, aPartido, fechaHora, type FilaJugador } from '../lib/pronosticos';
import { useSesion } from '../lib/sesion';
import {
  CAMPOS,
  NOMBRE_CAMPO,
  aFilas,
  leerTabla,
  nombresDudosos,
  proponerAsignacion,
  type Asignacion,
  type Campo,
  type TablaCruda,
} from '../lib/tablaPegada';
import { useJornadaActual } from '../lib/usePronosticos';

const FILAS_VISTA_PREVIA = 5;
const MANTENER = '__mantener__';
/** Un documento de Firestore admite 1 MiB; se deja margen. */
const TAMANO_MAXIMO = 900_000;

function usarJugadoresConocidos(uid: string): string[] {
  const importaciones = useColeccion(uid, 'pronImportaciones', aImportacion);
  const { jornada } = useJornadaActual(uid);
  const partidos = useProceso(
    uid,
    'pronPartidos',
    aPartido,
    jornada ? { donde: ['jornada', '==', jornada.id] as ['jornada', '==', string] } : null,
  );
  return useMemo(() => {
    const nombres = new Set<string>();
    for (const i of importaciones.datos) for (const f of i.filas) nombres.add(f.jugador);
    for (const p of partidos.datos) {
      for (const lista of Object.values(p.jugadores)) for (const j of lista ?? []) nombres.add(j.jugador);
    }
    return [...nombres];
  }, [importaciones.datos, partidos.datos]);
}

export function ImportarTabla() {
  const uid = useSesion().usuario!.uid;
  const importaciones = useColeccion(uid, 'pronImportaciones', aImportacion);
  const conocidos = usarJugadoresConocidos(uid);
  const [texto, setTexto] = useState('');
  const [fuente, setFuente] = useState('');
  const [tabla, setTabla] = useState<TablaCruda | null>(null);
  const [asignacion, setAsignacion] = useState<Asignacion>({});
  const [decisiones, setDecisiones] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const resultado = useMemo(() => (tabla ? aFilas(tabla, asignacion) : null), [tabla, asignacion]);
  const dudas = useMemo(
    () => (resultado ? nombresDudosos(resultado.filas.map((f) => f.jugador), conocidos) : []),
    [resultado, conocidos],
  );
  const ordenadas = [...importaciones.datos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  function preparar(contenido: string) {
    const leida = leerTabla(contenido);
    setMensaje(null);
    setDecisiones({});
    if (!leida.filas.length) {
      setTabla(null);
      setMensaje({ error: true, texto: 'No se ha encontrado ninguna tabla en ese texto.' });
      return;
    }
    setTabla(leida);
    setAsignacion(proponerAsignacion(leida.cabecera));
  }

  async function elegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    try {
      const contenido = await archivo.text();
      setTexto(contenido);
      preparar(contenido);
    } catch {
      setMensaje({ error: true, texto: 'No se ha podido leer el archivo.' });
    }
  }

  function asignar(campo: Campo, valor: string) {
    const nueva = { ...asignacion };
    // Una columna solo puede ser un campo.
    for (const c of CAMPOS) if (nueva[c] === Number(valor)) delete nueva[c];
    if (valor === '') delete nueva[campo];
    else nueva[campo] = Number(valor);
    setAsignacion(nueva);
  }

  async function guardar() {
    if (!resultado || resultado.error) return;
    if (!fuente.trim()) {
      setMensaje({ error: true, texto: 'Escribe de dónde sale la tabla.' });
      return;
    }
    if (dudas.some((d) => decisiones[d.nombre] === undefined)) {
      setMensaje({ error: true, texto: 'Decide primero qué hacer con los nombres dudosos.' });
      return;
    }
    const filas: FilaJugador[] = resultado.filas.map((f) => {
      const elegido = decisiones[f.jugador];
      return elegido && elegido !== MANTENER ? { ...f, jugador: elegido } : f;
    });
    const fecha = new Date().toISOString();
    const documento = { fuente: fuente.trim(), fecha, filas };
    if (JSON.stringify(documento).length > TAMANO_MAXIMO) {
      setMensaje({ error: true, texto: 'La tabla es demasiado grande. Divídela por ligas e impórtalas por separado.' });
      return;
    }
    setGuardando(true);
    try {
      await guardarElemento(uid, 'pronImportaciones', documento);
      setMensaje({ error: false, texto: `Importados ${filas.length} jugadores de ${fuente.trim()}.` });
      setTabla(null);
      setTexto('');
      setFuente('');
    } catch {
      setMensaje({ error: true, texto: 'No se ha podido guardar. Vuelve a intentarlo.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ajustes__bloque" aria-labelledby="importar-titulo">
      <h2 id="importar-titulo">Importar datos de jugadores</h2>
      <p className="texto-suave ajustes__explicacion">
        Copia una tabla de una web y pégala aquí, o sube un CSV. Se guarda solo en tu cuenta.
      </p>
      <label className="campo">
        <span>Tabla pegada</span>
        <textarea rows={6} spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <div className="formulario__acciones">
        <button type="button" className="boton boton--principal boton--peq" disabled={!texto.trim()} onClick={() => preparar(texto)}>
          Ver vista previa
        </button>
        <label className="boton boton--secundario boton--peq boton--archivo">
          Subir un CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="oculto" onChange={elegirArchivo} />
        </label>
      </div>

      {tabla && (
        <div className="importar">
          <p>
            Elige qué dato hay en cada columna. Vista previa de{' '}
            {Math.min(FILAS_VISTA_PREVIA, tabla.filas.length)} de {tabla.filas.length} filas.
          </p>
          <div className="formulario formulario--tres">
            {CAMPOS.map((campo) => (
              <label key={campo} className="campo">
                <span>{NOMBRE_CAMPO[campo]}</span>
                <select value={asignacion[campo] ?? ''} onChange={(e) => asignar(campo, e.target.value)}>
                  <option value="">Sin asignar</option>
                  {tabla.cabecera.map((nombre, i) => (
                    <option key={`${nombre}-${i}`} value={i}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="tabla-marco tabla-marco--ancha">
            <table className="tabla tabla--simple tabla--compacta">
              <thead>
                <tr>
                  {tabla.cabecera.map((nombre, i) => (
                    <th key={`${nombre}-${i}`} scope="col">
                      {nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.slice(0, FILAS_VISTA_PREVIA).map((fila, i) => (
                  <tr key={i}>
                    {tabla.cabecera.map((_, j) => (
                      <td key={j}>{fila[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resultado?.error && (
            <p className="aviso-error" role="alert">
              {resultado.error}
            </p>
          )}
          {resultado && !resultado.error && (
            <p className="texto-pequeno">
              Se importarán {resultado.filas.length} jugadores
              {resultado.descartadas > 0 && `; ${resultado.descartadas} filas no tienen datos válidos y se descartan`}.
            </p>
          )}

          {dudas.length > 0 && (
            <div className="dudas">
              <p>Estos nombres se parecen a jugadores conocidos. ¿Son el mismo?</p>
              {dudas.map((d) => (
                <label key={d.nombre} className="campo">
                  <span>{d.nombre}</span>
                  <select
                    value={decisiones[d.nombre] ?? ''}
                    onChange={(e) => setDecisiones({ ...decisiones, [d.nombre]: e.target.value })}
                  >
                    <option value="" disabled>
                      Elige una opción
                    </option>
                    <option value={MANTENER}>Es otro jugador: dejarlo como está</option>
                    {d.candidatos.map((c) => (
                      <option key={c} value={c}>
                        Es {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <label className="campo">
            <span>Fuente</span>
            <input value={fuente} onChange={(e) => setFuente(e.target.value)} />
            <small className="campo__ayuda">De qué web sale la tabla. Se guarda con la fecha de hoy.</small>
          </label>
          <div className="formulario__acciones">
            <button
              type="button"
              className="boton boton--principal"
              disabled={guardando || !resultado || Boolean(resultado.error)}
              onClick={guardar}
            >
              {guardando ? 'Guardando…' : 'Guardar la importación'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setTabla(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {mensaje && (
        <p className={mensaje.error ? 'aviso-error ajustes__mensaje' : 'texto-suave ajustes__mensaje'} role="status">
          {mensaje.texto}
        </p>
      )}

      {ordenadas.length > 0 && (
        <ul className="lista-registro importaciones">
          {ordenadas.map((i) => (
            <li key={i.id} className="plazo plazo--sin-placa">
              <div className="plazo__cuerpo">
                <p className="plazo__titulo">{i.fuente || 'Sin fuente'}</p>
                <p className="texto-pequeno">
                  {fechaHora(i.fecha)} · {i.filas.length} jugadores
                </p>
              </div>
              <div className="plazo__acciones">
                <BorrarConConfirmacion
                  aviso={`¿Borrar la importación de ${i.fuente || 'esta fuente'}?`}
                  onBorrar={() => borrarElemento(uid, 'pronImportaciones', i.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
