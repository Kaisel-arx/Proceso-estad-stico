import { COLOR, GROSO_BARRA } from './lienzo';

const estilos = {
  leyenda: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem 0.95rem',
    margin: '0.5rem 0 0 0',
    padding: 0,
    listStyle: 'none',
    fontSize: '0.68rem',
    lineHeight: 1.4,
    color: COLOR.tenue,
  },
  item: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem' },
  marco: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', flex: '0 0 15px' },
  barra: { width: '11px', height: '9px', borderRadius: 2 },
  linea: { width: '14px', height: '3px', borderRadius: 2 },
  circulo: { width: '10px', height: '10px', borderRadius: '50%', border: '1px solid var(--grafica-borde)' },
};

// Leyenda: una fila por serie, con la muestra dibujada con la misma forma que
// la serie (relleno con borde, linea continua, linea segmentada o circulo),
// de modo que el grafico se lee sin depender del texto.
function Leyenda({ items }) {
  return (
    <ul style={estilos.leyenda}>
      {items.map((item) => (
        <li key={item.texto} style={estilos.item}>
          <span style={estilos.marco} aria-hidden="true">
            {item.tipo === 'barra' ? (
              <span
                style={{
                  ...estilos.barra,
                  background: item.color,
                  border: `${GROSO_BARRA}px solid var(--grafica-borde)`,
                  boxSizing: 'border-box',
                }}
              />
            ) : item.tipo === 'color' ? (
              <span style={{ ...estilos.circulo, background: item.color }} />
            ) : (
              <span
                style={{
                  ...estilos.linea,
                  background:
                    item.tipo === 'segmentada'
                      ? `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`
                      : item.color,
                }}
              />
            )}
          </span>
          {item.texto}
        </li>
      ))}
    </ul>
  );
}

export default Leyenda;
