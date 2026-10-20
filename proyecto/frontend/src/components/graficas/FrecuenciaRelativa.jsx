import { formatear } from '../../utils/formato';
import { interpretarRelativa } from '../../stats/interpretaciones';
import Marco, { EjeX } from './Marco';
import Barra from './Barra';
import { COLOR, X1, Y1, curva, bordesBarra, decLimites, estilos } from './lienzo';

// Frecuencia relativa en porcentaje: barras con borde, etiqueta clara dentro
// de la barra y curva de tendencia segmentada por encima.
function FrecuenciaRelativa({ tabla, activa, onClaseActiva }) {
  const { filas } = tabla;
  const dec = decLimites(tabla);
  const bordes = bordesBarra(tabla);

  return (
    <Marco
      titulo="Frecuencia relativa"
      interpretacion={interpretarRelativa(tabla)}
      dominioX={[bordes[0].izquierda, bordes[bordes.length - 1].derecha]}
      dominioY={[0, 100]}
      marcasY={[0, 25, 50, 75, 100]}
      formatoY={(v) => `${formatear(v, 0)} %`}
      leyenda={[
        { tipo: 'barra', color: COLOR.barra, texto: 'Porcentaje de datos en el intervalo' },
        { tipo: 'segmentada', color: COLOR.serie, texto: 'Tendencia de la frecuencia relativa' },
      ]}
    >
      {({ px, py, gradiente, verTip, ocultarTip }) => (
        <>
          {bordes.map((b, i) => {
            const x = px(b.izquierda);
            const ancho = Math.max(px(b.derecha) - x, 1);
            const alto = Math.max(Y1 - py(filas[i].relativa), 0);
            return (
              <Barra
                key={`barra-${filas[i].clase}`}
                x={x}
                ancho={ancho}
                alto={alto}
                gradiente={gradiente}
                activa={activa === i}
                lineas={[
                  `Clase ${filas[i].clase}: [${formatear(filas[i].limiteInferior, dec)}, ${formatear(filas[i].limiteSuperior, dec)})`,
                  `fr = ${formatear(filas[i].relativa, 2)} % (${filas[i].frecuencia} de ${tabla.n})`,
                  `fa = ${filas[i].acumulada} acumulados`,
                ]}
                onActivar={() => onClaseActiva?.(i)}
                onDescansar={() => onClaseActiva?.(-1)}
                verTip={verTip}
                ocultarTip={ocultarTip}
              />
            );
          })}

          {/* El porcentaje se dibuja DESPUES del borde de la barra: asi el
              contorno queda por debajo del texto y el dato se lee limpio. */}
          {bordes.map((b, i) => {
            const x = px(b.izquierda);
            const ancho = Math.max(px(b.derecha) - x, 1);
            const yBarra = py(filas[i].relativa);
            // En una barra baja la etiqueta clara no cabe dentro: se sube sobre
            // la barra y en tinta oscura.
            const dentro = Y1 - yBarra >= 22;
            return (
              <text
                key={`porcentaje-${filas[i].clase}`}
                x={x + ancho / 2}
                y={dentro ? yBarra + 13 : yBarra - 6}
                textAnchor="middle"
                paintOrder="stroke"
                strokeWidth={dentro ? 1.4 : 0}
                pointerEvents="none"
                style={{
                  ...estilos.textoPorcentaje,
                  fill: dentro ? '#f6efef' : 'var(--grafica-valor)',
                  stroke: dentro ? 'var(--grafica-borde)' : 'var(--superficie)',
                }}
              >
                {formatear(filas[i].relativa, 1)} %
              </text>
            );
          })}

          {/* La tendencia es una serie derivada, no un conteo por intervalo,
              asi que aqui si tiene sentido suavizar. */}
          <path
            d={curva(px, py, filas.map((f) => [f.marcaClase, f.relativa]))}
            fill="none"
            style={{ stroke: COLOR.serie }}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="5 4"
            pointerEvents="none"
          />
          {filas.map((f, i) => (
            <circle
              key={`punto-${f.clase}`}
              cx={px(f.marcaClase)}
              cy={py(f.relativa)}
              r={activa === i ? 3.75 : 2.5}
              style={{ fill: COLOR.serie, cursor: 'pointer', transition: 'r 140ms ease-out' }}
              className="trazo-barra"
              strokeWidth="1"
              onMouseEnter={() => onClaseActiva?.(i)}
              onMouseMove={
                verTip
                  ? (evento) =>
                      verTip(evento, [
                        `Tendencia · clase ${f.clase}`,
                        `xm = ${formatear(f.marcaClase, tabla.datosEnteros ? 0 : 1)} · fr = ${formatear(f.relativa, 1)} %`,
                      ])
                  : undefined
              }
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

export default FrecuenciaRelativa;
