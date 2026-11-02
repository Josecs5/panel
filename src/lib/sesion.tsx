import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from './firebase';

type Sesion = { cargando: boolean; usuario: User | null; cerrarSesion: () => void };

const Contexto = createContext<Sesion | null>(null);

function cerrarSesion() {
  if (auth) void signOut(auth);
}

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(auth !== null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nuevo) => {
      setUsuario(nuevo);
      setCargando(false);
    });
  }, []);

  return (
    <Contexto.Provider value={{ cargando, usuario, cerrarSesion }}>{children}</Contexto.Provider>
  );
}

export function useSesion(): Sesion {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('useSesion debe usarse dentro de ProveedorDeSesion');
  return sesion;
}
