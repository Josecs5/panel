import { useEffect, useState } from 'react';

/** Los gráficos toman sus colores al dibujar: hay que repetirlo si cambia el modo de color. */
export function useModoOscuro() {
  const [oscuro, setOscuro] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const consulta = matchMedia('(prefers-color-scheme: dark)');
    const cambiar = () => setOscuro(consulta.matches);
    consulta.addEventListener('change', cambiar);
    return () => consulta.removeEventListener('change', cambiar);
  }, []);
  return oscuro;
}
