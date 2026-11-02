import { useState, type FormEvent } from 'react';
import type { DatosPosicion, Divisa, TipoPosicion } from '../lib/cartera';

export const POSICION_VACIA: DatosPosicion = {
  nombre: '',
  tipo: 'accion',
  identificador: '',
  divisa: 'USD',
  cantidad: null,
  precioMedio: null,
  fechaCompra: null,
};

const aTexto = (n: number | null) => (n === null ? '' : String(n));
const aNumero = (t: string) => (t.trim() === '' ? null : Number(t));

export function FormularioPosicion({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: DatosPosicion;
  onGuardar: (datos: DatosPosicion) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [tipo, setTipo] = useState<TipoPosicion>(inicial.tipo);
  const [identificador, setIdentificador] = useState(inicial.identificador);
  const [divisa, setDivisa] = useState<Divisa>(inicial.divisa);
  const [cantidad, setCantidad] = useState(aTexto(inicial.cantidad));
  const [precioMedio, setPrecioMedio] = useState(aTexto(inicial.precioMedio));
  const [fechaCompra, setFechaCompra] = useState(inicial.fechaCompra ?? '');
  const esFondo = tipo === 'fondo';

  function cambiarTipo(nuevo: TipoPosicion) {
    setTipo(nuevo);
    setDivisa(nuevo === 'fondo' ? 'EUR' : 'USD');
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    onGuardar({
      nombre: nombre.trim(),
      tipo,
      identificador: identificador.trim().toUpperCase(),
      divisa,
      cantidad: aNumero(cantidad),
      precioMedio: aNumero(precioMedio),
      fechaCompra: !esFondo && fechaCompra ? fechaCompra : null,
    });
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <label className="campo formulario__ancho">
        <span>Nombre</span>
        <input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="campo">
        <span>Tipo</span>
        <select value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoPosicion)}>
          <option value="accion">Acción</option>
          <option value="fondo">Fondo</option>
        </select>
      </label>
      <label className="campo">
        <span>{esFondo ? 'ISIN' : 'Ticker'}</span>
        <input
          required
          autoCapitalize="characters"
          spellCheck={false}
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
        />
      </label>
      <label className="campo">
        <span>Divisa</span>
        <select value={divisa} onChange={(e) => setDivisa(e.target.value as Divisa)}>
          <option>EUR</option>
          <option>USD</option>
        </select>
      </label>
      <label className="campo">
        <span>{esFondo ? 'Participaciones iniciales' : 'Cantidad'}</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        {esFondo && (
          <small className="campo__ayuda">
            Solo las anteriores a las aportaciones que registres aquí. Si las registras todas, déjalo vacío.
          </small>
        )}
      </label>
      <label className="campo">
        <span>{esFondo ? 'Precio medio de las iniciales' : 'Precio medio'}</span>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={precioMedio}
          onChange={(e) => setPrecioMedio(e.target.value)}
        />
      </label>
      {!esFondo && (
        <label className="campo">
          <span>Fecha de compra</span>
          <input type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} />
        </label>
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
