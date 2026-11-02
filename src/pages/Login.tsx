import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../lib/firebase';
import { aEmailDeLogin, mensajeDeError } from '../lib/login';

const DOMINIO = import.meta.env.VITE_LOGIN_DOMAIN;
const CONFIG_COMPLETA = auth !== null && Boolean(DOMINIO?.trim());

export function Login() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    const email = aEmailDeLogin(usuario, DOMINIO);
    if (!auth || !email) return;
    setEnviando(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, contrasena);
    } catch (fallo) {
      setError(mensajeDeError((fallo as { code?: string }).code));
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <h1 className="acceso__marca">Panel</h1>
      <form className="acceso__formulario" onSubmit={entrar}>
        <label className="campo">
          <span>Usuario</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </label>
        {!CONFIG_COMPLETA && (
          <p className="aviso-error" role="alert">
            Falta la configuración de Firebase en esta versión de la web. Revisa las variables VITE_ y
            vuelve a publicarla.
          </p>
        )}
        {error && (
          <p className="aviso-error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--principal" disabled={enviando || !CONFIG_COMPLETA}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
