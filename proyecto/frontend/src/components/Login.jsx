import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { iniciarSesion, registrar } from '../services/api';

const estilos = {
  contenedor: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background: 'radial-gradient(1200px 600px at 15% -10%, var(--acento-suave), transparent 60%), var(--bg)',
  },
  // --- Lado izquierdo: banner conceptual de analisis de datos ---
  arte: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '1.5rem',
    padding: '2rem 1.8rem',
    background: 'linear-gradient(160deg, #122e34 0%, #0e1d21 60%, #3a1730 140%)',
    color: '#e8edee',
    minHeight: 460,
    boxSizing: 'border-box',
  },
  arteMarca: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: '#f6efef',
  },
  arteLema: {
    margin: '0.35rem 0 0 0',
    fontSize: '0.8rem',
    lineHeight: 1.55,
    color: '#abafb5',
    maxWidth: '30ch',
  },
  arteGrafica: { display: 'block', width: '100%', height: 'auto' },
  artePie: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  arteChip: {
    fontSize: '0.68rem',
    fontWeight: 650,
    letterSpacing: '0.04em',
    color: '#abafb5',
    border: '1px solid rgba(103, 126, 138, 0.45)',
    borderRadius: 999,
    padding: '0.18rem 0.6rem',
  },

  // --- Lado derecho: formulario ---
  panel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '2rem 2.1rem',
  },
  titulo: { margin: '0 0 0.25rem 0', fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--texto)' },
  subtitulo: { margin: '0 0 1.3rem 0', fontSize: '0.85rem', color: 'var(--texto-tenue)' },

  formulario: { display: 'flex', flexDirection: 'column', gap: '0.8rem' },
  conmutador: {
    margin: '1.1rem 0 0 0',
    textAlign: 'center',
    fontSize: '0.8rem',
    color: 'var(--texto-tenue)',
  },
  conmutadorBoton: {
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

/** Iconos de ojo (contrasena visible / oculta) en SVG en linea. */
function IconoOjo({ tachado }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {tachado ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/**
 * Ilustracion minimalista de la identidad StatLab: composicion en tres planos
 * (barras, curva normal, dispersion) dibujada con la paleta maestra sobre el
 * fondo profundo del banner. Los puntos de luz del fondo dan profundidad sin
 * competir con el formulario.
 */
function IlustracionEstadistica() {
  return (
    <svg
      style={estilos.arteGrafica}
      viewBox="0 0 320 210"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="login-barrera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8496a0" />
          <stop offset="100%" stopColor="#677e8a" />
        </linearGradient>
        <linearGradient id="login-curva" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e0b4b2" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#e0b4b2" />
          <stop offset="100%" stopColor="#e0b4b2" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="login-brillo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#622347" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#622347" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Atmosfera: brillo difuso detras de la composicion */}
      <ellipse cx="170" cy="100" rx="150" ry="95" fill="url(#login-brillo)" />

      {/* Puntos de dispersion del fondo */}
      {[
        [38, 42], [74, 28], [296, 52], [268, 34], [304, 150], [22, 168], [56, 186], [286, 186],
      ].map(([cx, cy]) => (
        <circle key={`fondo-${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="#677e8a" opacity="0.55" />
      ))}

      {/* Rejilla tenue del plano de dibujo */}
      {[52, 88, 124, 160].map((y) => (
        <line key={`rejilla-${y}`} x1="28" y1={y} x2="292" y2={y} stroke="#677e8a" strokeWidth="1" opacity="0.18" />
      ))}

      {/* Barras minimalistas: base solida, cima redondeada, una destacada */}
      {[
        { x: 44, h: 38, t: '#677e8a', o: 0.4 },
        { x: 82, h: 66, t: '#677e8a', o: 0.55 },
        { x: 120, h: 96, t: '#e0b4b2', o: 0.9 },
        { x: 158, h: 78, t: '#677e8a', o: 0.65 },
        { x: 196, h: 52, t: '#677e8a', o: 0.5 },
        { x: 234, h: 30, t: '#677e8a', o: 0.38 },
      ].map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={162 - b.h}
          width="24"
          height={b.h}
          rx="4"
          fill={b.t}
          opacity={b.o}
        />
      ))}

      {/* Curva normal estilizada: el trazo dominante de la composicion */}
      <path
        d="M32 160 C 78 160, 92 36, 148 36 C 204 36, 218 160, 292 160"
        stroke="url(#login-curva)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Puntos en la marca de clase de la curva */}
      {[
        [70, 128], [110, 70], [148, 36], [186, 70], [226, 128],
      ].map(([cx, cy]) => (
        <circle key={`curva-${cx}`} cx={cx} cy={cy} r="3" fill="#0e1d21" stroke="#e0b4b2" strokeWidth="1.6" />
      ))}

      {/* Dispersion en diagonal: capa de datos sueltos sobre las barras */}
      {[
        [56, 140], [92, 118], [130, 84], [168, 104], [206, 130], [248, 146],
      ].map(([cx, cy]) => (
        <circle key={`disp-${cx}`} cx={cx} cy={cy} r="2.4" fill="#abafb5" opacity="0.85" />
      ))}

      {/* Ejes: marco sutil del plano */}
      <line x1="28" y1="162" x2="292" y2="162" stroke="#abafb5" strokeWidth="1.4" opacity="0.5" />
      <line x1="28" y1="28" x2="28" y2="162" stroke="#abafb5" strokeWidth="1.4" opacity="0.5" />
    </svg>
  );
}

/**
 * Puerta de entrada de la sesion: tarjeta dividida. En modo login el lado
 * izquierdo muestra la identidad visual de StatLab y el derecho el formulario;
 * en modo registro la ilustracion desaparece y el formulario queda centrado.
 *
 * El acceso es de un solo paso: tanto el login como el registro devuelven la
 * sesion (token JWT) y la aplicacion entra al panel de inmediato. No hay
 * pantalla intermedia de verificacion por codigo ni de recuperacion de
 * contrasena: esas dos rutas (y sus componentes) quedan en pausa mientras el
 * flujo por correo esta desactivado en el backend.
 */
function Login() {
  const { iniciarSesion: establecerSesion } = useAuth();
  const [vista, setVista] = useState('login');
  const [form, setForm] = useState({ identificador: '', usuario: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarContrasena, setMostrarContrasena] = useState(false);

  const cambiar = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));

  const cambiarVista = (destino) => {
    setVista(destino);
    setError(null);
    setMostrarContrasena(false);
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const esLogin = vista === 'login';
    try {
      if (esLogin) {
        const sesion = await iniciarSesion({
          identificador: form.identificador,
          password: form.password,
        });
        establecerSesion(sesion);
      } else {
        // El registro entrega la sesion directamente: la cuenta se crea activa
        // y quien se registra entra al panel sin pasos intermedios.
        const sesion = await registrar({
          usuario: form.usuario,
          email: form.email,
          password: form.password,
        });
        establecerSesion(sesion);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const esLogin = vista === 'login';
  const puedeEnviar = !enviando && form.password && (esLogin ? form.identificador : form.usuario && form.email);

  return (
    <div style={estilos.contenedor}>
      <div className={`login-tarjeta${esLogin ? '' : ' login-tarjeta--registro'}`}>
        {/* Lado izquierdo: banner visual conceptual. Solo en login: el registro
            muestra el formulario centrado y limpio, sin ilustracion ni tarjeta. */}
        {esLogin && (
          <aside className="login-arte" style={estilos.arte} aria-hidden="true">
            <div>
              <p style={estilos.arteMarca}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="12" width="4" height="9" rx="1" fill="#677e8a" />
                  <rect x="10" y="6" width="4" height="15" rx="1" fill="#e0b4b2" />
                  <rect x="17" y="9" width="4" height="12" rx="1" fill="#677e8a" />
                </svg>
                StatLab
              </p>
              <p style={estilos.arteLema}>
                Distribuciones de frecuencias, medidas estadisticas y graficas, calculadas al
                instante a partir de tus datos.
              </p>
            </div>

            <IlustracionEstadistica />

            <div style={estilos.artePie}>
              <span style={estilos.arteChip}>Frecuencias</span>
              <span style={estilos.arteChip}>Medidas</span>
              <span style={estilos.arteChip}>Histograma</span>
              <span style={estilos.arteChip}>Caja y bigotes</span>
            </div>
          </aside>
        )}

        {/* Lado derecho: formulario */}
        <div style={estilos.panel}>
          <h1 style={estilos.titulo}>{esLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h1>
          <p style={estilos.subtitulo}>
            {esLogin
              ? 'Inicia sesion para continuar con tus trabajos estadisticos.'
              : 'Registrate gratis y empieza a analizar tus datos en minutos.'}
          </p>

          <form style={estilos.formulario} onSubmit={enviar}>
            {esLogin ? (
              <label className="campo">
                <span className="campo-etiqueta">Usuario o correo</span>
                <input
                  className="entrada"
                  value={form.identificador}
                  onChange={cambiar('identificador')}
                  autoComplete="username"
                  autoFocus
                />
              </label>
            ) : (
              <>
                <label className="campo">
                  <span className="campo-etiqueta">Usuario</span>
                  <input
                    className="entrada"
                    value={form.usuario}
                    onChange={cambiar('usuario')}
                    autoComplete="username"
                    autoFocus
                  />
                  <span className="campo-nota">De 3 a 30 caracteres: letras, números, punto o guion bajo.</span>
                </label>
                <label className="campo">
                  <span className="campo-etiqueta">Correo electrónico</span>
                  <input
                    className="entrada"
                    type="email"
                    value={form.email}
                    onChange={cambiar('email')}
                    autoComplete="email"
                  />
                </label>
              </>
            )}

            <label className="campo">
              <span className="campo-etiqueta">Contraseña</span>
              <div className="entrada-envoltura">
                <input
                  className="entrada"
                  style={{ paddingRight: '2.5rem' }}
                  type={mostrarContrasena ? 'text' : 'password'}
                  value={form.password}
                  onChange={cambiar('password')}
                  autoComplete={esLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="boton-ojo"
                  onClick={() => setMostrarContrasena((visible) => !visible)}
                  aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={mostrarContrasena}
                  title={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <IconoOjo tachado={mostrarContrasena} />
                </button>
              </div>
              {!esLogin && <span className="campo-nota">Mínimo 6 caracteres.</span>}
            </label>

            {error && <p className="alerta alerta-error">{error}</p>}

            <button type="submit" className="btn btn-primario" disabled={!puedeEnviar} style={{ marginTop: '0.25rem', width: '100%', padding: '0.65rem' }}>
              {enviando ? 'Un momento…' : esLogin ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <p style={estilos.conmutador}>
            {esLogin ? '¿Aún no tienes cuenta? ' : '¿Ya tienes una cuenta? '}
            <button
              type="button"
              style={estilos.conmutadorBoton}
              onClick={() => cambiarVista(esLogin ? 'registro' : 'login')}
            >
              {esLogin ? 'Crear cuenta aquí' : 'Inicia sesión aquí'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
