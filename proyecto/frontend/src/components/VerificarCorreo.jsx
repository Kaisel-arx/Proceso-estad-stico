import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { reenviarVerificacion, verificarCuenta } from '../services/api';
import { Banner, Spinner } from './Mensajes';

const CODIGO_RE = /^\d{6}$/;
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
 * Pantalla de confirmacion del registro: ingresa el codigo de 6 digitos que
 * llego al correo. Al validar, el backend pasa la cuenta a 'activo' y entrega
 * la sesion, asi que quien verifica entra a StatLab sin mas pasos.
 *
 * Props:
 *   email            correo precargado (el del registro o el que devolvio el 403)
 *   expiraEnMinutos  caducidad que anuncio el backend (fallback 15)
 *   avisoInicial     mensaje de exito a mostrar (p. ej. "cuenta creada")
 *   esErrorInicial   si es true, avisoInicial se muestra como error (p. ej.
 *                    fallo del SMTP tras crear la cuenta, o login pendiente)
 *   modo             'smtp' (correo enviado) o 'consola' (sin SMTP configurado:
 *                    el codigo quedo impreso en el log del servidor)
 *   onVolver         vuelve a la pantalla de inicio de sesion
 */
function VerificarCorreo({ email, expiraEnMinutos, avisoInicial, esErrorInicial, modo, onVolver }) {
  const { iniciarSesion: establecerSesion } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(esErrorInicial ? avisoInicial : null);
  const [aviso, setAviso] = useState(esErrorInicial ? null : avisoInicial);
  const [enviando, setEnviando] = useState(false);
  const [reenviarEn, setReenviarEn] = useState(SEGUNDOS_REENVIO);
  // La cuenta ya estaba verificada (doble clic u otra pestana): no tiene
  // sentido seguir pidiendo codigos, asi que se oculta el formulario y solo
  // queda el camino de vuelta al inicio de sesion.
  const [yaVerificada, setYaVerificada] = useState(false);

  const minutos = expiraEnMinutos || 15;

  // Cuenta atras del reenvio: un tick por segundo mientras queden segundos.
  useEffect(() => {
    if (reenviarEn <= 0) return undefined;
    const reloj = setTimeout(() => setReenviarEn((s) => s - 1), 1000);
    return () => clearTimeout(reloj);
  }, [reenviarEn]);

  const verificar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      // El backend valida el codigo, activa la cuenta y devuelve la sesion.
      const sesion = await verificarCuenta({ email, codigo });
      establecerSesion(sesion);
    } catch (err) {
      // yaVerificada: el codigo ya se uso (doble clic u otra pestana). El
      // mensaje del backend ya invita a volver al login; aqui ademas se
      // cambia el formulario por un atajo directo a esa pantalla.
      if (err.datos?.yaVerificada) setYaVerificada(true);
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    if (reenviarEn > 0 || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await reenviarVerificacion(email);
      setAviso(respuesta.mensaje);
      setCodigo('');
      setReenviarEn(SEGUNDOS_REENVIO);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={estilos.contenedor}>
      <div className="login-tarjeta login-tarjeta--registro">
        <div style={estilos.panel}>
          <p style={estilos.pasos}>
            <span className="chip chip-calido">Verificación de correo</span>
            <span>{email}</span>
          </p>

          <h1 style={estilos.titulo}>
            {yaVerificada ? 'Tu cuenta ya está verificada' : 'Revisa tu correo'}
          </h1>
          <p style={estilos.subtitulo}>
            {yaVerificada
              ? 'Ya puedes iniciar sesión con tu usuario y tu contraseña.'
              : `Hemos enviado un código de 6 dígitos a ${email}. Caduca en ${minutos} minutos.`}
          </p>

          {yaVerificada ? (
            <>
              <Banner tipo="error">{error}</Banner>

              <button
                type="button"
                className="btn btn-primario"
                onClick={onVolver}
                style={{ width: '100%', padding: '0.65rem' }}
              >
                Ir al inicio de sesión
              </button>
            </>
          ) : (
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
                <span className="campo-nota">
                  Solo dígitos. Si no llegó, puedes pedir un reenvío abajo.
                </span>
              </label>

              <Banner tipo="error">{error}</Banner>
              <Banner tipo="exito">{!error && aviso}</Banner>

              {/* Sin SMTP configurado el backend imprime el codigo en el log del
                  servidor en vez de enviarlo: decirlo evita que el usuario espere
                  un correo que nunca va a llegar. */}
              {modo === 'consola' && (
                <p className="banner-notificacion banner-notificacion--aviso" role="status">
                  Modo desarrollo: no hay servidor de correo configurado, así que el código se
                  imprimió en la consola del servidor en lugar de enviarse.
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primario"
                disabled={enviando || !CODIGO_RE.test(codigo)}
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {enviando ? (
                  <>
                    <Spinner />
                    Verificando…
                  </>
                ) : (
                  'Verificar y entrar'
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

          <p style={estilos.pie}>
            ¿Necesitas otra cuenta?{' '}
            <button type="button" style={estilos.pieBoton} onClick={onVolver}>
              Volver al inicio de sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default VerificarCorreo;
