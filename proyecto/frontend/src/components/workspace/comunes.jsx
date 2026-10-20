// Piezas compartidas de las tarjetas del area de trabajo: iconografia,
// tonos por familia de medidas y el contenedor de medida (Medida). Las
// rejillas de tiles viven en ui.css (clase .rejilla-datos).

export const estilos = {
  separador: {
    height: 1,
    background: 'var(--borde)',
    margin: '1.15rem 0',
  },
  datoEncabezado: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  icono: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    flex: '0 0 20px',
    borderRadius: 6,
  },
  datoNota: {
    fontSize: '0.65rem',
    color: 'var(--texto-suave)',
    lineHeight: 1.35,
  },
};

// Iconografia en SVG en linea: sin dependencias y en un solo tono, para no
// competir con el valor numerico que es lo que debe dominar.
export const RUTAS_ICONO = {
  media: 'M2 3h5l-3 5 3 5H2',
  ponderada: 'M2 12h2V7H2zM6 12h2V3H6zM10 12h2V9h-2z',
  mediana: 'M1 8h14M5 5v6M11 5v6',
  moda: 'M1 12c2 0 2.5-8 5.5-8S10 12 12 12',
  cuantil: 'M1 8h14M4 5v6M11.5 5v6',
  varianza: 'M2 11V5M6 11V2M10 11V7M14 11V4',
  desviacion: 'M1 14h14M3 11l3-6 3 4 3-7 3 9',
  coeficiente: 'M8 1v14M4 4h8M4 8h5M4 12h8',
};

// Un tono por familia de medidas, derivado de la paleta maestra de StatLab:
// rose para tendencia central, slate para posicion y plum para variabilidad.
export const TONOS = {
  central: { fondo: 'var(--calido-tenue)', tinta: 'var(--acento)' },
  posicion: { fondo: 'var(--superficie-3)', tinta: 'var(--borde-fuerte)' },
  variabilidad: { fondo: 'var(--acento-suave)', tinta: '#c286a8' },
};

export const TONO_POR_DEFECTO = TONOS.central;

export function Icono({ nombre, tono = TONO_POR_DEFECTO }) {
  return (
    <span style={{ ...estilos.icono, background: tono.fondo, color: tono.tinta }} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={RUTAS_ICONO[nombre]} />
      </svg>
    </span>
  );
}

// Tarjeta de una medida. `vacio` cubre los casos en que la medida no aplica
// (la moda sin repetidos, el coeficiente con media 0): es preferible mostrarlo
// explicito a esconder un null. `nota` siempre se muestra debajo del valor;
// `descripcion` alimenta el tooltip y solo se imprime si va vacio.
export function Medida({ icono, etiqueta, valor, descripcion, nota, vacio, tono = TONO_POR_DEFECTO }) {
  return (
    <div className={`dato${vacio ? ' dato-vacio' : ''}`} title={descripcion}>
      <div style={estilos.datoEncabezado}>
        <Icono nombre={icono} tono={tono} />
        <span className="dato-etiqueta">{etiqueta}</span>
      </div>
      <span className={`dato-valor${vacio ? ' dato-valor-vacio' : ''}`}>
        {vacio ? 'No se aplica' : valor}
      </span>
      {nota && <span style={estilos.datoNota}>{nota}</span>}
      {vacio && <span style={estilos.datoNota}>{descripcion}</span>}
    </div>
  );
}
