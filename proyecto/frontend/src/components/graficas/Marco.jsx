import { useId } from 'react';
import { formatear } from '../../utils/formato';
import TarjetaGrafica from './TarjetaGrafica';
import DegradadoBarra from './DegradadoBarra';
import { X0, X1, Y0, Y1, GROSO_EJE, escala, anclar, estilos } from './lienzo';

// Marcas del eje horizontal: la etiqueta se ancla hacia dentro para que la
// primera y la ultima no se salgan del lienzo, y el texto queda centrado.
function EjeX({ marcas }) {
  return marcas.map((m, j) => (
    <g key={`eje-x-${j}`}>
      <line x1={m.x} y1={Y1} x2={m.x} y2={Y1 + 4} className="trazo" strokeWidth="1.5" />
      <text x={anclar(m.x, 26)} y={Y1 + 15} textAnchor="middle" style={estilos.textoEje}>
        {m.texto}
      </text>
    </g>
  ));
}

/**
 * Marco de una grafica con ejes: area de dibujo, rejilla y marco, sobre la
 * tarjeta compartida (tooltip + leyenda + interpretacion). Los hijos reciben
 * px, py, el id del gradiente y las funciones del tooltip.
 */
function Marco({ titulo, dominioX, dominioY, marcasY = [], leyenda, formatoY, interpretacion, children }) {
  const px = escala(dominioX, [X0, X1]);
  const py = escala(dominioY, [Y1, Y0]);
  const fmtY = formatoY ?? ((v) => formatear(v, 0));
  // Un id por instancia: las cinco graficas se montan a la vez y comparten
  // documento, asi que un id fijo en los <defs> haria que las ultimas barras
  // usaran el degradado de la primera.
  const gradiente = `degradado-${useId()}`;

  return (
    <TarjetaGrafica titulo={titulo} leyenda={leyenda} interpretacion={interpretacion}>
      {({ verTip, ocultarTip }) => (
        <>
          <DegradadoBarra id={gradiente} />

          {marcasY.map((v) => (
            <g key={`rejilla-${v}`}>
              <line x1={X0} y1={py(v)} x2={X1} y2={py(v)} className="rejilla-grafica" strokeWidth="1" />
              <text x={X0 - 7} y={py(v) + 3.5} textAnchor="end" style={estilos.textoEje}>
                {fmtY(v)}
              </text>
            </g>
          ))}

          {children({ px, py, gradiente, verTip, ocultarTip })}

          {/* El marco se dibuja despues del contenido para quedar siempre
              encima: si las barras se pintaran despues, su relleno se comeria
              la mitad interior del borde lateral. */}
          <rect
            x={X0}
            y={Y0}
            width={X1 - X0}
            height={Y1 - Y0}
            fill="none"
            className="trazo"
            strokeWidth={GROSO_EJE}
          />
        </>
      )}
    </TarjetaGrafica>
  );
}

export { EjeX };
export default Marco;
