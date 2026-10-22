/**
 * Piezas de retroalimentacion visuales compartidas por las pantallas de
 * autenticacion (Login, RecuperarContrasena, VerificarCorreo).
 */

/** Spinner de carga: anillo en el acento calido de la paleta StatLab. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/**
 * Banner de notificacion con entrada animada, icono y role="alert" para que
 * lector de pantalla lo anuncie. `tipo` = 'error' (rojo) o 'exito' (verde);
 * los colores salen de las variables del tema, asi que respeta el modo
 * claro y oscuro.
 */
export function Banner({ tipo = 'error', children }) {
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
