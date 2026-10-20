import { formatear } from '../../utils/formato';
import { interpretarHistograma } from '../../stats/interpretaciones';
import Marco, { EjeX } from './Marco';
import Barra from './Barra';
import {
  COLOR,
  X1,
  Y1,
  ejeVertical,
  puntos,
  curva,
  bordesBarra,
  decLimites,
  lineasClase,
} from './lienzo';

// Barras de frecuencia por intervalo de clase, con la linea de la marca de
// clase superpuesta y las capas opcionales (poligono y suavizada) por encima.
// Las barras van de limite real a limite real para que aparezcan contiguas.
function Histograma({ tabla, activa, onClaseActiva, capas = {} }) {
  const { filas } = tabla;
  const y = ejeVertical(Math.max(...filas.map((f) => Math.max(f.frecuencia, capas.suavizada ? f.suavizada : 0))));
  const dec = decLimites(tabla);
  const bordes = bordesBarra(tabla);

  return (
    <Marco
      titulo="Histograma de frecuencias"
      interpretacion={interpretarHistograma(tabla)}
      dominioX={[bordes[0].izquierda, bordes[bordes.length - 1].derecha]}
      dominioY={[0, y.techo]}
      marcasY={y.marcas}
      leyenda={[
        { tipo: 'barra', color: COLOR.barra, texto: 'Frecuencia absoluta por intervalo' },
        { tipo: 'continua', color: COLOR.acento, texto: 'Frecuencia en la marca de clase' },
        ...(capas.poligono ? [{ tipo: 'continua', color: COLOR.serie, texto: 'Polígono superpuesto' }] : []),
        ...(capas.suavizada ? [{ tipo: 'continua', color: COLOR.acento, texto: 'Suavizada superpuesta' }] : []),
      ]}
    >
      {({ px, py, gradiente, verTip, ocultarTip }) => (
        <>
          {bordes.map((b, i) => {
            const x = px(b.izquierda);
            const yTop = py(filas[i].frecuencia);
            return (
              <Barra
                key={`barra-${filas[i].clase}`}
                x={x}
                ancho={Math.max(px(b.derecha) - x, 1)}
                alto={Math.max(Y1 - yTop, 0)}
                gradiente={gradiente}
                activa={activa === i}
                lineas={lineasClase(filas[i], tabla)}
                onActivar={() => onClaseActiva?.(i)}
                onDescansar={() => onClaseActiva?.(-1)}
                verTip={verTip}
                ocultarTip={ocultarTip}
              />
            );
          })}

          {/* La linea de la marca de clase describe el dato real, asi que aqui
              se deja recta a proposito: una curva en el histograma sugeriria
              frecuencias intermedias que no existen. */}
          <polyline
            points={puntos(px, py, filas.map((f) => [f.marcaClase, f.frecuencia]))}
            fill="none"
            style={{ stroke: COLOR.acento }}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {capas.poligono && (
            <path
              d={curva(px, py, filas.map((f) => [f.marcaClase, f.frecuencia]))}
              fill="none"
              style={{ stroke: COLOR.serie }}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {capas.suavizada && (
            <path
              d={curva(px, py, filas.map((f) => [f.marcaClase, f.suavizada]))}
              fill="none"
              style={{ stroke: COLOR.acento }}
              strokeWidth="2.5"
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {filas.map((f, i) => (
            <circle
              key={`punto-${f.clase}`}
              cx={px(f.marcaClase)}
              cy={py(f.frecuencia)}
              r={activa === i ? 4.5 : 3}
              style={{ fill: COLOR.acento, cursor: 'pointer', transition: 'r 140ms ease-out' }}
              className="trazo-barra"
              strokeWidth="1"
              onMouseEnter={() => onClaseActiva?.(i)}
              onMouseMove={verTip ? (evento) => verTip(evento, lineasClase(f, tabla)) : undefined}
              onMouseLeave={() => {
                ocultarTip?.();
                onClaseActiva?.(-1);
              }}
            />
          ))}

          {/* Las etiquetas del eje X son los propios bordes de las barras. */}
          <EjeX
            marcas={[
              ...bordes.map((b) => ({
                x: px(b.izquierda),
                texto: formatear(b.izquierda, dec),
              })),
              { x: X1, texto: formatear(bordes[bordes.length - 1].derecha, dec) },
            ]}
          />
        </>
      )}
    </Marco>
  );
}

export default Histograma;
