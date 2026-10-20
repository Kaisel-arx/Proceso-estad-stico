import { useRef, useState } from 'react';
import Leyenda from './Leyenda';
import { ANCHO, ALTO } from './lienzo';

/**
 * Tarjeta de una grafica: figure con el contrato del reporte PDF
 * (data-reporte + data-titulo + data-interpretacion + <svg>), tooltip HTML
 * que sigue al cursor, leyenda y recuadro de interpretacion automatica.
 *
 * El tooltip vive en el estado del figure (position relative): cada elemento
 * dibujado llama a verTip(evento, lineas) en onMouseMove y a ocultarTip en
 * onMouseLeave. Cuando el cursor queda en el tercio derecho del lienzo el
 * tooltip se voltea a la izquierda para no salirse de la tarjeta.
 */
function TarjetaGrafica({ titulo, leyenda, interpretacion, children }) {
  const [realce, setRealce] = useState(false);
  const [tip, setTip] = useState(null);
  const figura = useRef(null);

  const verTip = (evento, lineas) => {
    const marco = figura.current;
    if (!marco) return;
    const r = marco.getBoundingClientRect();
    setTip({
      x: evento.clientX - r.left,
      y: evento.clientY - r.top,
      lineas,
      volteado: evento.clientX - r.left > r.width * 0.62,
    });
  };
  const ocultarTip = () => setTip(null);

  return (
    <figure
      ref={figura}
      data-reporte="grafica"
      data-titulo={titulo}
      data-interpretacion={interpretacion || ''}
      className={`tarjeta-grafica${realce ? ' tarjeta-grafica--realce' : ''}`}
      onMouseEnter={() => setRealce(true)}
      onMouseLeave={() => {
        setRealce(false);
        ocultarTip();
      }}
    >
      <figcaption className="tarjeta-grafica-titulo">{titulo}</figcaption>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        width="100%"
        style={{ height: 'auto', display: 'block' }}
        role="img"
        aria-label={titulo}
      >
        {typeof children === 'function' ? children({ verTip, ocultarTip }) : children}
      </svg>
      {tip && (
        <div
          className={`tooltip-grafica${tip.volteado ? ' volteado' : ''}`}
          style={{ left: tip.x, top: tip.y }}
          role="tooltip"
        >
          {tip.lineas.map((linea, i) => (
            <div key={i} className={i === 0 ? 'tooltip-grafica-titulo' : undefined}>
              {linea}
            </div>
          ))}
        </div>
      )}
      <Leyenda items={leyenda} />

      {/* La lectura estadistica se muestra en pantalla y viaja tambien al PDF
          por la ruta data-interpretacion. */}
      {interpretacion && <p className="interpretacion">{interpretacion}</p>}
    </figure>
  );
}

export default TarjetaGrafica;
