import { useAuth } from '../context/AuthContext';
import { useTema } from '../context/TemaContext';

const estilos = {
  barra: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    flexWrap: 'wrap',
    padding: '0.6rem 1.25rem',
    background: 'var(--superficie)',
    borderBottom: '1px solid var(--borde)',
    boxShadow: 'var(--sombra-panel)',
  },
  marca: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--texto)',
  },
  marcaRefuerzo: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--texto-suave)',
    letterSpacing: '0.02em',
    marginLeft: '0.15rem',
  },
  navegacion: {
    display: 'flex',
    gap: '0.3rem',
    flexWrap: 'wrap',
  },
  enlace: {
    padding: '0.38rem 0.75rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--texto-tenue)',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 9,
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  enlaceHover: { background: 'var(--superficie-2)', color: 'var(--texto)' },
  enlaceActivo: {
    color: 'var(--chip-activo-texto)',
    background: 'var(--chip-activo-bg)',
    border: '1px solid var(--chip-activo-borde)',
  },
  derecha: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7rem',
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  usuario: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.76rem',
    fontWeight: 650,
    color: 'var(--texto-tenue)',
  },
  usuarioIniciales: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--acento-suave)',
    border: '1px solid var(--calido)',
    color: 'var(--acento)',
    fontSize: '0.68rem',
    fontWeight: 800,
  },
  salir: {
    padding: '0.34rem 0.75rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--texto-tenue)',
    background: 'var(--superficie-2)',
    border: '1px solid var(--borde)',
    borderRadius: 9,
    cursor: 'pointer',
    transition: 'border-color 150ms ease, color 150ms ease',
  },

  // Interruptor de tema: la pista cambia de tono y el nodo se desliza, con la
  // misma animacion en ambos sentidos.
  interruptor: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.22rem 0.55rem 0.22rem 0.38rem',
    background: 'transparent',
    border: '1px solid var(--borde)',
    borderRadius: 999,
    cursor: 'pointer',
  },
  pista: {
    position: 'relative',
    width: 36,
    height: 18,
    borderRadius: 999,
    transition: 'background 160ms ease',
    flex: '0 0 36px',
  },
  nodo: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#f6efef',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
    transition: 'transform 160ms ease',
  },
  etiquetaTema: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--texto-tenue)',
  },
};

// Iniciales del usuario para el avatar tipografico del navbar
function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().slice(0, 2).toUpperCase();
}

/**
 * Barra superior: marca StatLab, navegacion entre vistas, sesion vigente y el
 * interruptor de modo oscuro. El interruptor es un boton con role="switch", para
 * que el estado se lea correctamente con lector de pantalla.
 */
function Navbar({ vista, onMenu, onHistorial, onNuevo }) {
  const { usuario, cerrarSesion } = useAuth();
  const { esOscuro, alternar } = useTema();

  const estiloEnlace = (activo) =>
    activo
      ? { ...estilos.enlace, ...estilos.enlaceActivo }
      : estilos.enlace;

  return (
    <header style={estilos.barra}>
      <p style={estilos.marca}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="12" width="4" height="9" rx="1" style={{ fill: 'var(--grafica-barra)' }} />
          <rect x="10" y="6" width="4" height="15" rx="1" style={{ fill: 'var(--calido)' }} />
          <rect x="17" y="9" width="4" height="12" rx="1" style={{ fill: 'var(--grafica-barra)' }} />
        </svg>
        StatLab
        <span style={estilos.marcaRefuerzo}>Panel</span>
      </p>

      <nav style={estilos.navegacion} aria-label="Vistas principales">
        <button type="button" style={estiloEnlace(vista === 'menu')} onClick={onMenu}>
          Menú
        </button>
        <button type="button" style={estiloEnlace(vista === 'historial')} onClick={onHistorial}>
          Historial
        </button>
        <button type="button" style={estiloEnlace(vista === 'trabajo')} onClick={onNuevo}>
          Nuevo trabajo
        </button>
      </nav>

      <div style={estilos.derecha}>
        <button
          type="button"
          role="switch"
          aria-checked={esOscuro}
          aria-label="Modo oscuro"
          title={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={alternar}
          style={estilos.interruptor}
        >
          <span
            style={{
              ...estilos.pista,
              background: esOscuro ? 'var(--acento)' : 'var(--borde-fuerte)',
            }}
          >
            <span
              style={{
                ...estilos.nodo,
                transform: esOscuro ? 'translateX(18px)' : 'translateX(0)',
              }}
            />
          </span>
          <span style={estilos.etiquetaTema}>{esOscuro ? 'Oscuro' : 'Claro'}</span>
        </button>

        <span style={estilos.usuario} title={usuario?.usuario}>
          <span style={estilos.usuarioIniciales} aria-hidden="true">
            {iniciales(usuario?.usuario)}
          </span>
          {usuario?.usuario}
        </span>
        <button type="button" style={estilos.salir} onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

export default Navbar;
