import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { restablecerContrasena, solicitarCodigoRecuperacion } from '../services/api';
import { Banner, Spinner } from './Mensajes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODIGO_RE = /^\d{6}$/;
const PASSWORD_MINIMO = 6;
const SEGUNDOS_REENVIO = 60;

const estilos = {
  contenedor: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background: 'radial-gradient(1200px 600px at 15% -10%, var(--acento-suave), transparent 60%), var(--bg)',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '2rem 2.1rem',
  },
  pasos: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0 0 0.9rem 0',
    fontSize: '0.72rem',
    fontWeight: 650,
    letterSpacing: '0.03em',
    color: 'var(--texto-tenue)',
  },
  titulo: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.45rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--texto)',
  },
  subtitulo: { margin: '0 0 1.3rem 0', fontSize: '0.85rem', color: 'var(--texto-tenue)' },
  formulario: { display: 'flex', flexDirection: 'column', gap: '0.8rem' },
  codigo: {
    textAlign: 'center',
    fontSize: '1.5rem',
    fontWeight: 750,
    letterSpacing: '0.42em',
    textIndent: '0.42em',
  },
  pie: {
    margin: '1.1rem 0 0 0',
    textAlign: 'center',
    fontSize: '0.8rem',
    color: 'var(--texto-tenue)',
  },
  pieBoton: {
    padding: 0,
    fontSize: '0.8rem',
    fontWeight: 700,
    color: 'var(--acento)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
};

/**
 * Flujo de recuperacion de contrasena en dos pasos:
 *  1. correo registrado -> el backend manda un codigo de 6 digitos;
 *  2. codigo + nueva contrasena -> el backend valida, cambia la clave, limpia
 *     el codigo y entrega la sesion (quien presento el codigo demostro control
 *     del correo, asi que no hay que escribir la clave dos veces).
 *
 * Props:
 *   modo        'smtp' (correo enviado) o 'consola' (sin SMTP: el codigo quedo
 *               impreso en el log del servidor)
 *   onVerificar callback para saltar a la pantalla de verificacion cuando la
 *               cuenta existe pero nunca confirmo su correo
 *   onVolver    vuelve a la pantalla de inicio de sesion
 */
function RecuperarContrasena({ modo, onVerificar, onVolver }) {
  const { iniciarSesion: establecerSesion } = useAuth();
  const [paso, setPaso] = useState('correo');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [expiraEnMinutos, setExpiraEnMinutos] = useState(15);
  const [modoEnvio, setModoEnvio] = useState(modo || null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviarEn, setReenviarEn] = useState(0);

  // Cuenta atras del reenvio: un tick por segundo mientras queden segundos.
  useEffect(() => {
    if (reenviarEn <= 0) return undefined;
    const reloj = setTimeout(() => setReenviarEn((s) => s - 1), 1000);
    return () => clearTimeout(reloj);
  }, [reenviarEn]);

  const pedirCodigo = async () => {
    // Guarda extra contra doble clic: el boton ya queda deshabilitado con
    // `enviando`, pero reenviar() y el submit comparten esta ruta.
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await solicitarCodigoRecuperacion(email);
      setAviso(respuesta.mensaje);
      setExpiraEnMinutos(respuesta.expiraEnMinutos || 15);
      setModoEnvio(respuesta.modo || null);
      setCodigo('');
      setReenviarEn(SEGUNDOS_REENVIO);
      setPaso('codigo');
    } catch (err) {
      // Un 400 con pendienteVerificacion significa que la cuenta existe pero
      // nunca confirmo su correo: lo que necesita es verificar, no recuperar
      // la clave, asi que se ofrece el salto a la pantalla de verificacion.
      if (err.datos?.pendienteVerificacion && onVerificar) {
        onVerificar(err.datos.email || email);
        return;
      }
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const solicitar = async (e) => {
    e.preventDefault();
    await pedirCodigo();
  };

  const reenviar = async () => {
    if (reenviarEn > 0 || enviando) return;
    await pedirCodigo();
  };

  const restaurar = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    try {
      // El backend valida el codigo, guarda la clave nueva, borra el codigo y
      // devuelve la sesion: quien la recibe ya esta dentro de StatLab.
      const sesion = await restablecerContrasena({ email, codigo, password });
      establecerSesion(sesion);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const cambiarDeCorreo = () => {
    setPaso('correo');
    setError(null);
    setAviso(null);
    setCodigo('');
    setPassword('');
    setConfirmacion('');
  };

  const esPasoCorreo = paso === 'correo';
  const subtitulo = esPasoCorreo
    ? 'Escribe el correo con el que te registraste y te enviaremos un código de verificación.'
    : `Hemos enviado un código de 6 dígitos a ${email}. Caduca en ${expiraEnMinutos} minutos.`;

  return (
    <div style={estilos.contenedor}>
      <div className="login-tarjeta login-tarjeta--registro">
        <div style={estilos.panel}>
          <p style={estilos.pasos}>
            <span className="chip chip-calido">
              Paso {esPasoCorreo ? 1 : 2} de 2
            </span>
            <span>{esPasoCorreo ? 'Correo' : 'Código y contraseña'}</span>
          </p>

          <h1 style={estilos.titulo}>Recuperar contraseña</h1>
          <p style={estilos.subtitulo}>{subtitulo}</p>

          {esPasoCorreo && (
            <form style={estilos.formulario} onSubmit={solicitar}>
              <label className="campo">
                <span className="campo-etiqueta">Correo electrónico</span>
                <input
                  className="entrada"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  autoFocus
                />
              </label>

              <Banner tipo="error">{error}</Banner>

              <button
                type="submit"
                className="btn btn-primario"
                disabled={enviando || !EMAIL_RE.test(email.trim())}
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {enviando ? (
                  <>
                    <Spinner />
                    Enviando…
                  </>
                ) : (
                  'Enviar código'
                )}
              </button>
            </form>
          )}

          {!esPasoCorreo && (
            <form style={estilos.formulario} onSubmit={restaurar}>
              <label className="campo">
                <span className="campo-etiqueta">Código de verificación</span>
                <input
                  className="entrada entrada-mono"
                  style={estilos.codigo}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                />
                <span className="campo-nota">
                  Solo dígitos. Caduca a los {expiraEnMinutos} minutos.
                </span>
              </label>

              <label className="campo">
                <span className="campo-etiqueta">Nueva contraseña</span>
                <input
                  className="entrada"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <span className="campo-nota">Mínimo {PASSWORD_MINIMO} caracteres.</span>
              </label>

              <label className="campo">
                <span className="campo-etiqueta">Repite la contraseña</span>
                <input
                  className="entrada"
                  type="password"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <Banner tipo="error">{error}</Banner>
              <Banner tipo="exito">{!error && aviso}</Banner>

              {/* Sin SMTP configurado el codigo queda en la consola del
                  servidor en vez de enviarse por correo. */}
              {modoEnvio === 'consola' && (
                <p className="banner-notificacion banner-notificacion--aviso" role="status">
                  Modo desarrollo: no hay servidor de correo configurado, así que el código se
                  imprimió en la consola del servidor en lugar de enviarse.
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primario"
                disabled={
                  enviando ||
                  !CODIGO_RE.test(codigo) ||
                  password.length < PASSWORD_MINIMO ||
                  password !== confirmacion
                }
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {enviando ? (
                  <>
                    <Spinner />
                    Guardando…
                  </>
                ) : (
                  'Guardar contraseña y entrar'
                )}
              </button>

              <button
                type="button"
                className="btn btn-fantasma"
                onClick={reenviar}
                disabled={reenviarEn > 0 || enviando}
              >
                {reenviarEn > 0 ? `Reenviar código en ${reenviarEn} s` : 'Reenviar código'}
              </button>

              <button type="button" className="btn btn-fantasma" onClick={cambiarDeCorreo}>
                Cambiar de correo
              </button>
            </form>
          )}

          <p style={estilos.pie}>
            {esPasoCorreo ? '¿Ya la recuerdas? ' : '¿Prefieres iniciar sesión? '}
            <button type="button" style={estilos.pieBoton} onClick={onVolver}>
              Volver al inicio de sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RecuperarContrasena;
