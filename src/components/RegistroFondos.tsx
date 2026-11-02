import { useState, type FormEvent } from 'react';
import {
  participacionesDe,
  type Aportacion,
  type DatosAportacion,
  type DatosLiquidativo,
  type Liquidativo,
  type Posicion,
} from '../lib/cartera';
import { borrarElemento, guardarElemento } from '../lib/datos';
import { fechaCorta } from '../lib/fechas';
import { moneda, numero } from '../lib/formato';
import { BorrarConConfirmacion } from './BorrarConConfirmacion';

type Props = {
  uid: string;
  fondos: Posicion[];
  aportaciones: Aportacion[];
  liquidativos: Liquidativo[];
  hoy: string;
  importeHabitual: number;
  onError: (mensaje: string) => void;
};

const NUEVO = 'nuevo';
const porFechaDesc = <T extends { fecha: string }>(a: T, b: T) => b.fecha.localeCompare(a.fecha);

function SelectorFondo({
  fondos,
  valor,
  onCambiar,
}: {
  fondos: Posicion[];
  valor: string;
  onCambiar: (id: string) => void;
}) {
  return (
    <label className="campo formulario__ancho">
      <span>Fondo</span>
      <select required value={valor} onChange={(e) => onCambiar(e.target.value)}>
        {fondos.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

function BotonesFormulario({ onCancelar }: { onCancelar: () => void }) {
  return (
    <div className="formulario__acciones formulario__ancho">
      <button className="boton boton--principal">Guardar</button>
      <button type="button" className="boton boton--secundario" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}

function FormularioAportacion({
  fondos,
  inicial,
  onGuardar,
  onCancelar,
}: {
  fondos: Posicion[];
  inicial: DatosAportacion | { posicionId: string; fecha: string; importe: number; valorLiquidativo: null };
  onGuardar: (datos: DatosAportacion) => void;
  onCancelar: () => void;
}) {
  const [posicionId, setPosicionId] = useState(inicial.posicionId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [importe, setImporte] = useState(String(inicial.importe));
  const [vl, setVl] = useState(inicial.valorLiquidativo === null ? '' : String(inicial.valorLiquidativo));
  const importeN = Number(importe);
  const vlN = Number(vl);
  const calculable = importeN > 0 && vlN > 0;

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (calculable) onGuardar({ posicionId, fecha, importe: importeN, valorLiquidativo: vlN });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <SelectorFondo fondos={fondos} valor={posicionId} onCambiar={setPosicionId} />
      <label className="campo">
        <span>Fecha</span>
        <input type="date" required autoFocus value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        <span>Importe</span>
        <input
          type="number"
          required
          min="0.01"
          step="any"
          inputMode="decimal"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Valor liquidativo</span>
        <input
          type="number"
          required
          min="0.000001"
          step="any"
          inputMode="decimal"
          value={vl}
          onChange={(e) => setVl(e.target.value)}
        />
      </label>
      <p className="formulario__calculo" role="status">
        {calculable
          ? `Son ${numero(participacionesDe({ importe: importeN, valorLiquidativo: vlN }), 4)} participaciones.`
          : 'Las participaciones se calculan con el importe y el valor liquidativo.'}
      </p>
      <BotonesFormulario onCancelar={onCancelar} />
    </form>
  );
}

function FormularioLiquidativo({
  fondos,
  inicial,
  onGuardar,
  onCancelar,
}: {
  fondos: Posicion[];
  inicial: { posicionId: string; fecha: string; valor: number | null };
  onGuardar: (datos: DatosLiquidativo) => void;
  onCancelar: () => void;
}) {
  const [posicionId, setPosicionId] = useState(inicial.posicionId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [valor, setValor] = useState(inicial.valor === null ? '' : String(inicial.valor));

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (Number(valor) > 0) onGuardar({ posicionId, fecha, valor: Number(valor) });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <SelectorFondo fondos={fondos} valor={posicionId} onCambiar={setPosicionId} />
      <label className="campo">
        <span>Fecha</span>
        <input type="date" required autoFocus value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="campo">
        <span>Valor liquidativo</span>
        <input
          type="number"
          required
          min="0.000001"
          step="any"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </label>
      <BotonesFormulario onCancelar={onCancelar} />
    </form>
  );
}

export function RegistroFondos({ uid, fondos, aportaciones, liquidativos, hoy, importeHabitual, onError }: Props) {
  const [editandoAp, setEditandoAp] = useState<string | null>(null);
  const [editandoVl, setEditandoVl] = useState<string | null>(null);
  const nombreDe = (id: string) => fondos.find((f) => f.id === id);

  function escribir(promesa: Promise<unknown>, accion: string) {
    promesa.catch(() => onError(`No se ha podido ${accion}. Vuelve a intentarlo.`));
  }

  return (
    <div className="registro">
      <section aria-labelledby="cartera-aportaciones">
        <div className="seccion__titulo seccion__titulo--accion">
          <h2 id="cartera-aportaciones">Aportaciones</h2>
          <button type="button" className="boton boton--secundario boton--peq" onClick={() => setEditandoAp(NUEVO)}>
            Registrar aportación
          </button>
        </div>
        {editandoAp === NUEVO && (
          <div className="plazo-formulario plazo-formulario--alta">
            <FormularioAportacion
              fondos={fondos}
              inicial={{ posicionId: fondos[0].id, fecha: hoy, importe: importeHabitual, valorLiquidativo: null }}
              onCancelar={() => setEditandoAp(null)}
              onGuardar={(datos) => {
                setEditandoAp(null);
                escribir(guardarElemento(uid, 'aportaciones', datos), 'guardar la aportación');
              }}
            />
          </div>
        )}
        {aportaciones.length === 0 ? (
          <p className="vacio">Sin aportaciones registradas.</p>
        ) : (
          <ul className="lista-registro">
            {[...aportaciones].sort(porFechaDesc).map((a) =>
              editandoAp === a.id ? (
                <li key={a.id} className="plazo-formulario">
                  <FormularioAportacion
                    fondos={fondos}
                    inicial={a}
                    onCancelar={() => setEditandoAp(null)}
                    onGuardar={(datos) => {
                      setEditandoAp(null);
                      escribir(guardarElemento(uid, 'aportaciones', datos, a.id), 'guardar la aportación');
                    }}
                  />
                </li>
              ) : (
                <li key={a.id} className="registro__fila">
                  <div>
                    <p className="registro__principal">
                      {moneda(a.importe, nombreDe(a.posicionId)?.divisa)}
                      <span className="registro__fecha">{fechaCorta(a.fecha)}</span>
                    </p>
                    <p className="texto-pequeno">
                      {nombreDe(a.posicionId)?.nombre ?? 'Fondo borrado'} · VL {numero(a.valorLiquidativo, 6)} ·{' '}
                      {numero(participacionesDe(a), 4)} participaciones
                    </p>
                  </div>
                  <div className="plazo__acciones">
                    <button type="button" className="boton boton--secundario" onClick={() => setEditandoAp(a.id)}>
                      Editar
                    </button>
                    <BorrarConConfirmacion
                      onBorrar={() => escribir(borrarElemento(uid, 'aportaciones', a.id), 'borrar la aportación')}
                    />
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="cartera-liquidativos">
        <div className="seccion__titulo seccion__titulo--accion">
          <h2 id="cartera-liquidativos">Valores liquidativos</h2>
          <button type="button" className="boton boton--secundario boton--peq" onClick={() => setEditandoVl(NUEVO)}>
            Registrar valor
          </button>
        </div>
        {editandoVl === NUEVO && (
          <div className="plazo-formulario plazo-formulario--alta">
            <FormularioLiquidativo
              fondos={fondos}
              inicial={{ posicionId: fondos[0].id, fecha: hoy, valor: null }}
              onCancelar={() => setEditandoVl(null)}
              onGuardar={(datos) => {
                setEditandoVl(null);
                escribir(guardarElemento(uid, 'liquidativos', datos), 'guardar el valor');
              }}
            />
          </div>
        )}
        {liquidativos.length === 0 ? (
          <p className="vacio">Sin valores sueltos. Cada aportación ya cuenta como un valor de ese día.</p>
        ) : (
          <ul className="lista-registro">
            {[...liquidativos].sort(porFechaDesc).map((l) =>
              editandoVl === l.id ? (
                <li key={l.id} className="plazo-formulario">
                  <FormularioLiquidativo
                    fondos={fondos}
                    inicial={l}
                    onCancelar={() => setEditandoVl(null)}
                    onGuardar={(datos) => {
                      setEditandoVl(null);
                      escribir(guardarElemento(uid, 'liquidativos', datos, l.id), 'guardar el valor');
                    }}
                  />
                </li>
              ) : (
                <li key={l.id} className="registro__fila">
                  <div>
                    <p className="registro__principal">
                      {numero(l.valor, 6)}
                      <span className="registro__fecha">{fechaCorta(l.fecha)}</span>
                    </p>
                    <p className="texto-pequeno">{nombreDe(l.posicionId)?.nombre ?? 'Fondo borrado'}</p>
                  </div>
                  <div className="plazo__acciones">
                    <button type="button" className="boton boton--secundario" onClick={() => setEditandoVl(l.id)}>
                      Editar
                    </button>
                    <BorrarConConfirmacion
                      onBorrar={() => escribir(borrarElemento(uid, 'liquidativos', l.id), 'borrar el valor')}
                    />
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
