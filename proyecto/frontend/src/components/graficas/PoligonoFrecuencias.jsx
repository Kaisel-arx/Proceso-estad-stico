import { formatear } from '../../utils/formato';
import { interpretarDistribucion } from '../../stats/interpretaciones';
import Marco, { EjeX } from './Marco';
import { COLOR, ejeVertical, curva, bordesBarra } from './lienzo';

// Poligono de frecuencias y curva de frecuencia suavizada, ambas sobre la
// marca de clase.
function PoligonoFrecuencias({ tabla, activa, onClaseActiva }) {
  const { filas } = tabla;
  const maximo = Math.max(...filas.map((f) => Math.max(f.frecuencia, f.suavizada)));
  const y = ejeVertical(maximo);
  // El poligono comparte dominio con el histograma para que ambas graficas
  // ocupen el mismo eje horizontal.
  const bordes = bordesBarra(tabla);

  return (
    <Marco
      titulo="Polígono de frecuencias y frecuencia suavizada"
      interpretacion={interpretarDistribucion(tabla)}
      dominioX={[bordes[0].izquierda, bordes[bordes.length - 1].derecha]}
      dominioY={[0, y.techo]}
      marcasY={y.marcas}
      leyenda={[
        { tipo: 'continua', color: COLOR.serie, texto: 'Frecuencia absoluta' },
        { tipo: 'continua', color: COLOR.acento, texto: 'Frecuencia suavizada' },
      ]}
    >
      {({ px, py, verTip, ocultarTip }) => (
        <>
          {/* Aqui si que se suaviza: el poligono es una serie resumen, no un
              conteo, asi que una curva que pase por todos los puntos sin
              sobreimpulso es legitima y se lee mucho mas fluida. */}
          <path
            d={curva(px, py, filas.map((f) => [f.marcaClase, f.frecuencia]))}
            fill="none"
            style={{ stroke: COLOR.serie }}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
          {/* La suavizada es continua igual que la absoluta: se distinguen por
              el color, no por el trazo. */}
          <path
            d={curva(px, py, filas.map((f) => [f.marcaClase, f.suavizada]))}
            fill="none"
            style={{ stroke: COLOR.acento }}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />

          {filas.map((f, i) => (
            <g key={`nodo-${f.clase}`}>
              <circle
                cx={px(f.marcaClase)}
                cy={py(f.frecuencia)}
                r={activa === i ? 4.75 : 3.5}
                style={{ fill: COLOR.serie, cursor: 'pointer', transition: 'r 140ms ease-out' }}
                className="trazo-barra"
                strokeWidth="1"
                onMouseEnter={() => onClaseActiva?.(i)}
                onMouseMove={
                  verTip
                    ? (evento) =>
                        verTip(evento, [
                          `Polígono · clase ${f.clase}`,
                          `xm = ${formatear(f.marcaClase, tabla.datosEnteros ? 0 : 1)} · f = ${f.frecuencia}`,
                        ])
                    : undefined
                }
                onMouseLeave={() => {
                  ocultarTip?.();
                  onClaseActiva?.(-1);
                }}
              />
              <circle
                cx={px(f.marcaClase)}
                cy={py(f.suavizada)}
                r={activa === i ? 4.75 : 3.5}
                style={{ fill: COLOR.acento, cursor: 'pointer', transition: 'r 140ms ease-out' }}
                className="trazo-barra"
                strokeWidth="1"
                onMouseEnter={() => onClaseActiva?.(i)}
                onMouseMove={
                  verTip
                    ? (evento) =>
                        verTip(evento, [
                          `Suavizada · clase ${f.clase}`,
                          `fs = (${f.suavizada}) · xm = ${formatear(f.marcaClase, tabla.datosEnteros ? 0 : 1)}`,
                        ])
                    : undefined
                }
                onMouseLeave={() => {
                  ocultarTip?.();
                  onClaseActiva?.(-1);
                }}
              />
            </g>
          ))}

          <EjeX
            marcas={filas.map((f) => ({
              x: px(f.marcaClase),
              texto: formatear(f.marcaClase, tabla.datosEnteros ? 0 : 1),
            }))}
          />
        </>
      )}
    </Marco>
  );
}

export default PoligonoFrecuencias;
