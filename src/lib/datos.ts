import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { AJUSTES_INICIALES, aAjustes, aAjustesParciales, type Ajustes } from './ajustes.ts';
import { COLECCIONES, type Coleccion, type Copia, type Elemento } from './copia.ts';
import { aAjustesPronosticos, type AjustesPronosticos } from './pronosticos.ts';
import type { CacheMercado } from './cotizaciones.ts';
import { db } from './firebase.ts';

// Tras el login siempre hay configuración: si no, no se llega a estas pantallas.
const base = (): Firestore => {
  if (!db) throw new Error('Firestore no está configurado');
  return db;
};

const rutaColeccion = (uid: string, nombre: Coleccion) =>
  collection(base(), 'users', uid, nombre);
const rutaAjustes = (uid: string) => doc(base(), 'users', uid, 'ajustes', 'general');

export type Lectura<T> = { estado: 'cargando' | 'error' | 'listo'; datos: T };

/** Colección en vivo. `convertir` debe ser estable y descarta lo que no sea válido. */
export function useColeccion<T>(
  uid: string,
  nombre: Coleccion,
  convertir: (id: string, crudo: DocumentData) => T | null,
): Lectura<T[]> {
  const [lectura, setLectura] = useState<Lectura<T[]>>({ estado: 'cargando', datos: [] });

  useEffect(
    () =>
      onSnapshot(
        rutaColeccion(uid, nombre),
        (foto) => {
          const datos = foto.docs
            .map((d) => convertir(d.id, d.data()))
            .filter((d): d is T => d !== null);
          setLectura({ estado: 'listo', datos });
        },
        () => setLectura((previa) => ({ ...previa, estado: 'error' })),
      ),
    [uid, nombre, convertir],
  );

  return lectura;
}

export function useAjustes(uid: string): Lectura<Ajustes> {
  const [lectura, setLectura] = useState<Lectura<Ajustes>>({
    estado: 'cargando',
    datos: AJUSTES_INICIALES,
  });

  useEffect(
    () =>
      onSnapshot(
        rutaAjustes(uid),
        (foto) => setLectura({ estado: 'listo', datos: aAjustes(foto.data() ?? {}) }),
        () => setLectura((previa) => ({ ...previa, estado: 'error' })),
      ),
    [uid],
  );

  return lectura;
}

// Lo que escribe el proceso diario. La web solo lo lee: no hay función para guardarlo.
export type ColeccionProceso =
  | 'pronJornadas'
  | 'pronPartidos'
  | 'pronCongelados'
  | 'pronLiquidaciones'
  | 'pronMetricas'
  | 'pronVersiones'
  | 'pronEstado';

export type ConsultaProceso = {
  donde?: [campo: string, operador: '==' | '>=', valor: string];
  ordenDesc?: string;
  limite?: number;
};

/** `consulta` limita lo que se descarga: estas colecciones crecen cada semana. */
export function useProceso<T>(
  uid: string,
  nombre: ColeccionProceso,
  convertir: (id: string, crudo: DocumentData) => T | null,
  consulta?: ConsultaProceso | null,
): Lectura<T[]> {
  const [lectura, setLectura] = useState<Lectura<T[]>>({ estado: 'cargando', datos: [] });
  // null: la consulta depende de algo que aún no se conoce.
  const clave = consulta === null ? null : JSON.stringify(consulta ?? {});

  useEffect(() => {
    if (clave === null) return;
    const { donde, ordenDesc, limite }: ConsultaProceso = JSON.parse(clave);
    const filtros: QueryConstraint[] = [];
    if (donde) filtros.push(where(donde[0], donde[1], donde[2]));
    if (ordenDesc) filtros.push(orderBy(ordenDesc, 'desc'));
    if (limite) filtros.push(limit(limite));
    return onSnapshot(
      query(collection(base(), 'users', uid, nombre), ...filtros),
      (foto) => {
        const datos = foto.docs.map((d) => convertir(d.id, d.data())).filter((d): d is T => d !== null);
        setLectura({ estado: 'listo', datos });
      },
      () => setLectura((previa) => ({ ...previa, estado: 'error' })),
    );
  }, [uid, nombre, convertir, clave]);

  return lectura;
}

export function useDocumentoProceso<T>(
  uid: string,
  nombre: ColeccionProceso,
  id: string,
  convertir: (crudo: DocumentData) => T | null,
): Lectura<T | null> {
  const [lectura, setLectura] = useState<Lectura<T | null>>({ estado: 'cargando', datos: null });

  useEffect(
    () =>
      onSnapshot(
        doc(base(), 'users', uid, nombre, id),
        (foto) => setLectura({ estado: 'listo', datos: foto.exists() ? convertir(foto.data()) : null }),
        () => setLectura((previa) => ({ ...previa, estado: 'error' })),
      ),
    [uid, nombre, id, convertir],
  );

  return lectura;
}

const rutaAjustesPronosticos = (uid: string) => doc(base(), 'users', uid, 'ajustes', 'pronosticos');

export function useAjustesPronosticos(uid: string): Lectura<AjustesPronosticos> {
  const [lectura, setLectura] = useState<Lectura<AjustesPronosticos>>({
    estado: 'cargando',
    datos: aAjustesPronosticos({}),
  });

  useEffect(
    () =>
      onSnapshot(
        rutaAjustesPronosticos(uid),
        (foto) => setLectura({ estado: 'listo', datos: aAjustesPronosticos(foto.data() ?? {}) }),
        () => setLectura((previa) => ({ ...previa, estado: 'error' })),
      ),
    [uid],
  );

  return lectura;
}

export const guardarAjustesPronosticos = (uid: string, ajustes: AjustesPronosticos) =>
  setDoc(rutaAjustesPronosticos(uid), ajustes);

export function guardarElemento(
  uid: string,
  nombre: Coleccion,
  datos: DocumentData,
  id?: string,
): Promise<unknown> {
  const coleccion = rutaColeccion(uid, nombre);
  return id ? setDoc(doc(coleccion, id), datos) : addDoc(coleccion, datos);
}

export const borrarElemento = (uid: string, nombre: Coleccion, id: string) =>
  deleteDoc(doc(rutaColeccion(uid, nombre), id));

export const guardarAjustes = (uid: string, ajustes: Partial<Ajustes>) =>
  setDoc(rutaAjustes(uid), ajustes, { merge: true });

/** Borra una posición junto con sus aportaciones y valores liquidativos. */
export async function borrarPosicion(
  uid: string,
  posicionId: string,
  aportaciones: string[],
  liquidativos: string[],
): Promise<void> {
  const operaciones = [
    doc(rutaColeccion(uid, 'posiciones'), posicionId),
    ...aportaciones.map((id) => doc(rutaColeccion(uid, 'aportaciones'), id)),
    ...liquidativos.map((id) => doc(rutaColeccion(uid, 'liquidativos'), id)),
  ];
  for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
    const lote = writeBatch(base());
    operaciones.slice(i, i + TAMANO_LOTE).forEach((ref) => lote.delete(ref));
    await lote.commit();
  }
}

// Precios y cambio: no forman parte de la copia de seguridad porque se pueden volver a pedir.
const rutaCacheMercado = (uid: string) => doc(base(), 'users', uid, 'cache', 'mercado');

export async function leerCacheMercado(uid: string): Promise<CacheMercado> {
  const foto = await getDoc(rutaCacheMercado(uid));
  return { cotizaciones: {}, ...(foto.data() as Partial<CacheMercado> | undefined) };
}

export const guardarCacheMercado = (uid: string, cambios: Partial<CacheMercado>) =>
  setDoc(rutaCacheMercado(uid), cambios, { merge: true });

/** Reúne todos los datos del usuario en una copia de seguridad. */
export async function exportarDatos(uid: string): Promise<Copia> {
  const [ajustes, ajustesPronosticos, ...fotos] = await Promise.all([
    getDoc(rutaAjustes(uid)),
    getDoc(rutaAjustesPronosticos(uid)),
    ...COLECCIONES.map((nombre) => getDocs(rutaColeccion(uid, nombre))),
  ]);
  const copia: Copia = {
    version: 1,
    exportadoEn: new Date().toISOString(),
    ajustes: aAjustesParciales(ajustes.data() ?? {}),
  };
  if (ajustesPronosticos.exists()) {
    copia.ajustesPronosticos = aAjustesPronosticos(ajustesPronosticos.data());
  }
  COLECCIONES.forEach((nombre, i) => {
    copia[nombre] = fotos[i].docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return copia;
}

// Firestore admite 500 operaciones por lote.
const TAMANO_LOTE = 400;

/** Añade o sustituye por id; no borra nada de lo que ya exista. */
export async function importarDatos(uid: string, copia: Copia): Promise<void> {
  const operaciones: { nombre: Coleccion; elemento: Elemento }[] = COLECCIONES.flatMap((nombre) =>
    (copia[nombre] ?? []).map((elemento) => ({ nombre, elemento })),
  );

  for (let i = 0; i < operaciones.length; i += TAMANO_LOTE) {
    const lote = writeBatch(base());
    for (const { nombre, elemento } of operaciones.slice(i, i + TAMANO_LOTE)) {
      const { id, ...campos } = elemento;
      const coleccion = rutaColeccion(uid, nombre);
      lote.set(id ? doc(coleccion, id) : doc(coleccion), campos);
    }
    await lote.commit();
  }

  if (copia.ajustes && Object.keys(copia.ajustes).length) {
    await guardarAjustes(uid, copia.ajustes);
  }
  if (copia.ajustesPronosticos) await guardarAjustesPronosticos(uid, copia.ajustesPronosticos);
}
