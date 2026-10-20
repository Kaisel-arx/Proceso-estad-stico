import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const estilos = {
  // Interruptor de pestanas del panel
  pestanas: {
    display: 'flex',
    gap: '0.3rem',
    padding: '0.28rem',
    marginBottom: '1.35rem',
    background: 'var(--superficie-2)',
    border: '1px solid var(--borde)',
    borderRadius: 12,
    width: 'fit-content',
  },
  pestana: {
    padding: '0.45rem 0.95rem',
    fontSize: '0.83rem',
    fontWeight: 700,
    color: 'var(--texto-tenue)',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 9,
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  pestanaActiva: {
    color: 'var(--chip-activo-texto)',
    background: 'var(--chip-activo-bg)',
    borderColor: 'var(--chip-activo-borde)',
  },
};

const PASOS = [
  {
    titulo: '1. Ingresa tus datos',
    texto: (
      <>
        En la vista de trabajo escribe los valores numéricos separados por comas, espacios o
        saltos de línea (o usa el botón de datos aleatorios para probar). StatLab calcula
        automáticamente el número de intervalos <code>k</code>, la amplitud <code>i</code> y los
        límites de clase: límite inferior <code>ii</code> y límite superior <code>is</code>.
      </>
    ),
  },
  {
    titulo: '2. Revisa la tabla de frecuencias',
    texto: (
      <>
        Para cada clase verás la frecuencia absoluta <code>f</code>, la acumulada <code>fa</code>,
        la relativa <code>fr</code> en porcentaje, la suavizada <code>fs</code> y la marca de
        clase <code>xm</code>, más las columnas auxiliares <code>f·xm</code> y
        <code>(xm−x̄)²·f</code> que alimentan los cálculos.
      </>
    ),
  },
  {
    titulo: '3. Lee las medidas automáticas',
    texto: (
      <>
        Tendencia central (media aritmética, media ponderada, mediana y moda), variabilidad
        (varianza, desviación estándar y coeficiente de variación) y posición: controla los
        cuartiles, deciles y percentiles con el selector <code>k</code> de cada tarjeta.
      </>
    ),
  },
  {
    titulo: '4. Interpreta las gráficas',
    texto: (
      <>
        El histograma muestra la frecuencia por intervalo; la caja y bigotes resume la
        posición y dispersión (Q1, mediana, Q3, media); el polígono y la suavizada revelan la
        forma de la distribución; y la frecuencia relativa compara el porcentaje por clase.
      </>
    ),
  },
  {
    titulo: '5. Guarda y retoma tu trabajo',
    texto: (
      <>
        Dale un nombre al proyecto y pulsa <em>Guardar trabajo</em>: queda en tu cuenta dentro
        de MySQL. Desde <em>Historial</em> puedes reabrirlo en un clic y todos los resultados
        y gráficas se recalculan al instante con los datos originales.
      </>
    ),
  },
  {
    titulo: 'Consejo de interpretación',
    texto: (
      <>
        Si la media, la mediana y la moda están casi alineadas, la distribución es aproximadamente
        simétrica. Si la media se aleja de la mediana hacia la derecha, hay asimetría positiva.
        Un Cv mayor al 30 % indica alta dispersión relativa.
      </>
    ),
  },
];

/**
 * Menu principal: el punto de aterrizaje tras iniciar sesion. Tarjeta de
 * bienvenida, dos accesos directos (nueva hoja e historial) y una pestana
 * instructiva que explica como usar la plataforma de principio a fin.
 * El historial no vive aqui: onHistorial cambia la vista en App y muestra
 * la lista completa de trabajos guardados.
 */
function MenuPrincipal({ onNuevo, onHistorial }) {
  const { usuario } = useAuth();
  const [pestana, setPestana] = useState('panel');

  return (
    <section>
      <div style={estilos.pestanas} role="tablist" aria-label="Secciones del panel">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'panel'}
          style={pestana === 'panel' ? { ...estilos.pestana, ...estilos.pestanaActiva } : estilos.pestana}
          onClick={() => setPestana('panel')}
        >
          Panel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'guia'}
          style={pestana === 'guia' ? { ...estilos.pestana, ...estilos.pestanaActiva } : estilos.pestana}
          onClick={() => setPestana('guia')}
        >
          ¿Cómo usar StatLab?
        </button>
      </div>

      {pestana === 'panel' ? (
        <>
          {/* Tarjeta de bienvenida */}
          <div className="saludo">
            <div>
              <h1 className="saludo-titulo">¡Hola, {usuario?.usuario}! 👋</h1>
              <p className="saludo-subtitulo">
                ¿Qué quieres calcular hoy? Crea una nueva hoja de trabajo o retoma una guardada:
                las frecuencias, medidas y gráficas se generan al instante.
              </p>
            </div>
            <svg width="120" height="64" viewBox="0 0 120 64" fill="none" aria-hidden="true" style={{ opacity: 0.85 }}>
              <rect x="8" y="30" width="12" height="26" rx="2" fill="#677e8a" />
              <rect x="28" y="18" width="12" height="38" rx="2" fill="#e0b4b2" />
              <rect x="48" y="8" width="12" height="48" rx="2" fill="#677e8a" />
              <rect x="68" y="24" width="12" height="32" rx="2" fill="#e0b4b2" />
              <rect x="88" y="36" width="12" height="20" rx="2" fill="#677e8a" />
              <path d="M6 40 C 30 40, 34 12, 54 12 S 90 44, 114 44" stroke="#e0b4b2" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          {/* Modulos de acceso rapido */}
          <div className="acceso-rejilla">
            <button type="button" className="acceso-tarjeta" onClick={onNuevo}>
              <span className="acceso-icono" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <h2 className="acceso-titulo">Nueva hoja de trabajo</h2>
              <p className="acceso-texto">
                Ingresa una muestra numérica y obtén la tabla de frecuencias, las medidas y las
                gráficas calculadas al instante.
              </p>
            </button>

            <button type="button" className="acceso-tarjeta" onClick={onHistorial}>
              <span className="acceso-icono" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
              </span>
              <h2 className="acceso-titulo">Historial de trabajos</h2>
              <p className="acceso-texto">
                Reabre una tabla guardada: se recuperan los datos originales y todos los
                resultados se vuelven a calcular.
              </p>
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="vista-titulo" style={{ marginBottom: '0.4rem' }}>¿Cómo usar StatLab?</h1>
          <p style={{ margin: '0 0 1.25rem 0', color: 'var(--texto-tenue)', fontSize: '0.88rem', maxWidth: '65ch' }}>
            StatLab convierte una muestra numérica en una distribución de frecuencias completa con
            medidas y gráficas. Sigue estos pasos para aprovecharlo al máximo.
          </p>

          <div className="guia-rejilla">
            {PASOS.map((paso) => (
              <article key={paso.titulo} className="guia-paso">
                <span className="guia-numero" aria-hidden="true">
                  {paso.titulo.match(/\d/)?.[0] ?? '✓'}
                </span>
                <h2 className="guia-titulo">{paso.titulo.replace(/^\d\.\s*/, '')}</h2>
                <p className="guia-texto">{paso.texto}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default MenuPrincipal;
