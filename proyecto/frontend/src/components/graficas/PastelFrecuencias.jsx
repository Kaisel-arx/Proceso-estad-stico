import { formatear } from '../../utils/formato';
import { interpretarPastel } from '../../stats/interpretaciones';
import TarjetaGrafica from './TarjetaGrafica';
import { ANCHO, estilos, decLimites } from './lienzo';

/**
 * Sectores del pastel derivados de la paleta maestra de StatLab: se barre el
 * tono desde el slate (200 grados) hasta el rose (363) pasando por el plum
 * (330), con saturacion y luz fijas para que los sectores se lean igual en
 * modo claro y oscuro.
 */
function coloresPastel(n) {
  if (n <= 1) return ['hsl(200 28% 50%)'];
  return Array.from({ length: n }, (_, i) => {
    const tono = 200 + (i / (n - 1)) * 163;
    return `hsl(${tono.toFixed(0)} 28% 50%)`;
  });
}

// Punto en coordenadas polares del centro del anillo.
function puntoCircular(cx, cy, r, angulo) {
  const rad = (angulo * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Camino SVG de un sector de anillo entre dos angulos (en grados, 0 = este).
 * Un arco de 360 grados exactos no es valido en SVG, asi que el circulo
 * completo se parte en dos medios arcos por recursion.
 */
function caminoSector(cx, cy, rInterno, rExterno, a0, a1) {
  const extension = a1 - a0;
  if (extension >= 359.99) {
    const medio = a0 + extension / 2;
    return `${caminoSector(cx, cy, rInterno, rExterno, a0, medio)} ${caminoSector(cx, cy, rInterno, rExterno, medio, a1)}`;
  }

  const [x0, y0] = puntoCircular(cx, cy, rExterno, a0);
  const [x1, y1] = puntoCircular(cx, cy, rExterno, a1);
  const [x2, y2] = puntoCircular(cx, cy, rInterno, a1);
  const [x3, y3] = puntoCircular(cx, cy, rInterno, a0);
  const grande = extension > 180 ? 1 : 0;

  return (
    `M ${x0} ${y0} A ${rExterno} ${rExterno} 0 ${grande} 1 ${x1} ${y1} ` +
    `L ${x2} ${y2} A ${rInterno} ${rInterno} 0 ${grande} 0 ${x3} ${y3} Z`
  );
}

// Pastel (anillo) de frecuencias relativas: cada clase ocupa un sector
// proporcional a su fr. El sector activo se separa del centro y todos llevan
// tooltip; al recorrerlos se resalta tambien la fila correspondiente de la
// tabla.
function PastelFrecuencias({ tabla, activa, onClaseActiva }) {
  const { filas } = tabla;
  const dec = decLimites(tabla);
  const colores = coloresPastel(filas.length);
  const CX = ANCHO / 2;
  const CY = 112;
  const R_INTERNO = 46;
  const R_EXTERNO = 92;

  // Angulo acumulado: cada sector cubre fr / 100 de la vuelta completa,
  // empezando arriba (−90 grados) como es convencion.
  let acumulado = -90;
  const sectores = filas.map((f, i) => {
    const a0 = acumulado;
    const a1 = acumulado + (f.relativa / 100) * 360;
    acumulado = a1;
    return { fila: f, indice: i, a0, a1, centro: (a0 + a1) / 2, color: colores[i] };
  });

  return (
    <TarjetaGrafica
      titulo="Pastel de frecuencias relativas"
      interpretacion={interpretarPastel(tabla)}
      leyenda={filas.map((f, i) => ({
        tipo: 'color',
        color: colores[i],
        texto: `Clase ${f.clase}: ${formatear(f.relativa, 1)} %`,
      }))}
    >
      {({ verTip, ocultarTip }) => (
        <>
          {sectores.map((s) => {
            const resaltar = activa === s.indice;
            const desplazamiento = resaltar ? 5 : 0;
            const dx = Math.cos((s.centro * Math.PI) / 180) * desplazamiento;
            const dy = Math.sin((s.centro * Math.PI) / 180) * desplazamiento;
            return (
              <g
                key={`sector-${s.fila.clase}`}
                style={{
                  transform: `translate(${dx}px, ${dy}px)`,
                  transition: 'transform 160ms ease-out',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => onClaseActiva?.(s.indice)}
                onMouseMove={
                  verTip
                    ? (evento) =>
                        verTip(evento, [
                          `Clase ${s.fila.clase}: [${formatear(s.fila.limiteInferior, dec)}, ${formatear(s.fila.limiteSuperior, dec)})`,
                          `fr = ${formatear(s.fila.relativa, 2)} % · f = ${s.fila.frecuencia} de ${tabla.n}`,
                          `xm = ${formatear(s.fila.marcaClase, dec)}`,
                        ])
                    : undefined
                }
                onMouseLeave={() => {
                  ocultarTip?.();
                  onClaseActiva?.(-1);
                }}
              >
                <path
                  d={caminoSector(CX, CY, R_INTERNO, R_EXTERNO, s.a0, s.a1)}
                  style={{ fill: s.color, stroke: 'var(--superficie)', strokeWidth: 2 }}
                />
              </g>
            );
          })}

          {/* Centro del anillo: el total y el numero de clases. */}
          <text x={CX} y={CY - 4} textAnchor="middle" style={{ ...estilos.textoValor, fontSize: 15 }} pointerEvents="none">
            n = {tabla.n}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" style={estilos.textoEje} pointerEvents="none">
            {filas.length} clases
          </text>
        </>
      )}
    </TarjetaGrafica>
  );
}

export default PastelFrecuencias;
