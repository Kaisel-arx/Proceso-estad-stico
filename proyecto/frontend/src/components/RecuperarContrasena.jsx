import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  restablecerContrasena,
  solicitarCodigoRecuperacion,
  verificarCodigoRecuperacion,
} from '../services/api';

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
  acciones: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  confirmacion: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1.1rem 1rem',
    marginBottom: '1rem',
    textAlign: 'center',
    background: 'var(--superficie-2)',
    border: '1px solid var(--exito)',
    borderRadius: '14px',
  },
  confirmacionIcono: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2.6rem',
    height: '2.6rem',
    borderRadius: '999px',
    background: 'var(--superficie-3)',
    color: 'var(--exito)',
  },
  confirmacionTexto: { margin: 0, fontSize: '0.86rem', fontWeight: 650, color: 'var(--texto)' },
  confirmacionDetalle: { margin: 0, fontSize: '0.78rem', color: 'var(--texto-tenue)' },
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

/** Icono de tilde para el panel de "codigo verificado". */
function IconoTilde() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Spinner de carga: anillo en el acento calido de la paleta StatLab. */
function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/**
 * Banner de notificacion con entrada animada, icono y role="alert" para que
 * lector de pantalla lo anuncie. `tipo` = 'error' (rojo) o 'exito' (verde);
 * los colores salen de las variables del tema, asi que respeta el modo
 * claro y oscuro.
 */
function Banner({ tipo = 'error', children }) {
  if (!children) return null;
  return (
    <p
      className={`banner-notificacion banner-notificacion--${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      {tipo === 'error' ? (
        <svg className="banner-icono" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" />
          <path d="M8 5v3.6M8 11h.01" />
        </svg>
      ) : (
        <svg className="banner-icono" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" />
          <path d="M5.2 8.2 7.1 10l3.7-4" />
        </svg>
      )}
      <span>{children}</span>
    </p>
  );
}

/**
 * Flujo de recuperacion de contrasena en tres pasos:
 *  1. correo registrado -> el backend manda un codigo de 6 digitos;
 *  2. codigo -> si es correcto se abre sesion al momento;
 *  3. opcional -> cambiar la contrasena con esa sesion.
 *
 * Quien verifica el codigo ya entra a la aplicacion sin mas pasos: cambiar la
 * clave es una via alternativa, no un obstaculo obligatorio.
 */
function RecuperarContrasena({ onVolver }) {
  const { iniciarSesion: establecerSesion } = useAuth();
  const [paso, setPaso] = useState('correo');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [sesionVerificada, setSesionVerificada] = useState(null);
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
      setCodigo('');
      setReenviarEn(SEGUNDOS_REENVIO);
      setPaso('codigo');
    } catch (err) {
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

  const verificar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const sesion = await verificarCodigoRecuperacion({ email, codigo });
      setSesionVerificada(sesion);
      setAviso(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const cambiarContrasena = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    try {
      const sesion = await restablecerContrasena(password, sesionVerificada.token);
      establecerSesion(sesion);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const volverAlCodigo = () => {
    setPaso('codigo');
    setError(null);
    setPassword('');
    setConfirmacion('');
  };

  const pasoActual = paso === 'nueva' ? 3 : paso === 'codigo' ? 2 : 1;
  const etiquetaPaso = { correo: 'Correo', codigo: 'Código', nueva: 'Nueva contraseña' }[paso];

  const subtitulo =
    paso === 'correo'
      ? 'Escribe el correo con el que te registraste y te enviaremos un código de verificación.'
      : paso === 'codigo'
        ? `Hemos enviado un código de 6 dígitos a ${email}. Caduca en 10 minutos.`
        : 'Elige una contraseña nueva. Al guardarla entrarás en StatLab con ella.';

  return (
    <div style={estilos.contenedor}>
      <div className="login-tarjeta login-tarjeta--registro">
        <div style={estilos.panel}>
          <p style={estilos.pasos}>
            <span className="chip chip-calido">
              Paso {pasoActual} de 3
            </span>
            <span>{etiquetaPaso}</span>
          </p>

          <h1 style={estilos.titulo}>Recuperar contraseña</h1>
          <p style={estilos.subtitulo}>{subtitulo}</p>

          {paso === 'correo' && (
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

          {paso === 'codigo' && !sesionVerificada && (
            <form style={estilos.formulario} onSubmit={verificar}>
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
                <span className="campo-nota">Solo dígitos. Caduca a los 10 minutos.</span>
              </label>

              <Banner tipo="error">{error}</Banner>
              <Banner tipo="exito">{!error && aviso}</Banner>

              <button
                type="submit"
                className="btn btn-primario"
                disabled={enviando || !CODIGO_RE.test(codigo)}
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {enviando ? (
                  <>
                    <Spinner />
                    Comprobando…
                  </>
                ) : (
                  'Verificar código'
                )}
              </button>

              <button
                type="button"
                className="btn btn-fantasma"
                onClick={reenviar}
                disabled={reenviarEn > 0 || enviando}
              >
                {enviando && <Spinner />}
                {reenviarEn > 0 ? `Reenviar código en ${reenviarEn} s` : 'Reenviar código'}
              </button>
            </form>
          )}

          {paso === 'codigo' && sesionVerificada && (
            <>
              <div style={estilos.confirmacion}>
                <span style={estilos.confirmacionIcono}>
                  <IconoTilde />
                </span>
                <p style={estilos.confirmacionTexto}>Código verificado</p>
                <p style={estilos.confirmacionDetalle}>
                  Ya puedes entrar a StatLab o, si lo prefieres, cambiar tu contraseña.
                </p>
              </div>

              <div style={estilos.acciones}>
                <button
                  type="button"
                  className="btn btn-primario"
                  onClick={() => establecerSesion(sesionVerificada)}
                  style={{ width: '100%', padding: '0.65rem' }}
                >
                  Entrar a StatLab
                </button>
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => {
                    setPaso('nueva');
                    setError(null);
                  }}
                  style={{ width: '100%', padding: '0.65rem' }}
                >
                  Cambiar mi contraseña
                </button>
              </div>
            </>
          )}

          {paso === 'nueva' && (
            <form style={estilos.formulario} onSubmit={cambiarContrasena}>
              <label className="campo">
                <span className="campo-etiqueta">Nueva contraseña</span>
                <input
                  className="entrada"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
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

              <button
                type="submit"
                className="btn btn-primario"
                disabled={
                  enviando ||
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
                  'Guardar y entrar'
                )}
              </button>

              <button type="button" className="btn btn-fantasma" onClick={volverAlCodigo}>
                Volver
              </button>
            </form>
          )}

          <p style={estilos.pie}>
            {paso === 'correo' ? '¿Ya la recuerdas? ' : '¿Prefieres iniciar sesión? '}
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
