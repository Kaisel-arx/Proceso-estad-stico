import { useState } from 'react';
import { formatear } from '../../utils/formato';
import { interpretarCaja } from '../../stats/interpretaciones';
import TarjetaGrafica from './TarjetaGrafica';
import { COLOR, X0, X1, GROSO_EJE, escala, anclar, estilos } from './lienzo';

// Caja y bigotes horizontal: caja entre Q1 y Q3, linea de mediana, bigotes
// hasta el minimo y el maximo, y una cruz sobre la media, que no es un
// cuantil y por eso se marca aparte. Las cinco magnitudes llevan su etiqueta
// numerica debajo. No hay mapa a clases, asi que la caja no participa en el
// hover sincronizado.
function CajaBigotes({ tabla }) {
  const EJE = 100;
  const MEDIO = 46;
  const TOPE = EJE - MEDIO;
  const BASE = EJE + MEDIO;
  const BRAZO = 16;

  const dec = tabla.datosEnteros ? 1 : 2;
  const [cajaHover, setCajaHover] = useState(false);

  // El dominio se arma sobre todas las magnitudes dibujadas y no sobre
  // [Xmin, Xmax]: con datos casi constantes la interpolacion puede dejar Q1 o
  // Q3 fuera del rango de los datos, y la media de datos agrupados puede
  // caerse incluso fuera de los cinco valores.
  const magnitudes = [tabla.xMin, tabla.q1, tabla.mediana, tabla.q3, tabla.xMax, tabla.media];
  const menor = Math.min(...magnitudes);
  const mayor = Math.max(...magnitudes);
  const holgura = (mayor - menor) * 0.1 || 1;
  const px = escala([menor - holgura, mayor + holgura], [X0, X1]);

  const hitos = [
    { nombre: 'Xmin', valor: tabla.xMin, x: px(tabla.xMin) },
    { nombre: 'Q1', valor: tabla.q1, x: px(tabla.q1) },
    { nombre: 'Md', valor: tabla.mediana, x: px(tabla.mediana) },
    { nombre: 'Q3', valor: tabla.q3, x: px(tabla.q3) },
    { nombre: 'Xmax', valor: tabla.xMax, x: px(tabla.xMax) },
  ];

  // Cuando dos magnitudes coinciden sus marcas se solapan y el texto se
  // imprimira dos veces encima. Se rotula solo la primera de cada grupo.
  const rotulables = [];
  hitos.forEach((h) => {
    const previa = rotulables[rotulables.length - 1];
    if (previa && Math.abs(h.x - previa.x) < 22) return;
    rotulables.push(h);
  });

  return (
    <TarjetaGrafica
      titulo="Diagrama de caja y bigotes"
      interpretacion={interpretarCaja(tabla)}
      leyenda={[
        { tipo: 'barra', color: COLOR.caja, texto: 'Caja de Q1 a Q3' },
        { tipo: 'continua', color: COLOR.borde, texto: 'Mediana y bigotes hasta Xmin y Xmax' },
        { tipo: 'continua', color: COLOR.acento, texto: 'Media aritmética' },
      ]}
    >
      {({ verTip, ocultarTip }) => (
        <>
          <line x1={X0} y1={EJE} x2={X1} y2={EJE} className="trazo" strokeWidth={GROSO_EJE} />

          {/* Bigotes y tapas */}
          <line x1={hitos[0].x} y1={EJE} x2={hitos[1].x} y2={EJE} className="trazo" strokeWidth={GROSO_EJE} />
          <line x1={hitos[3].x} y1={EJE} x2={hitos[4].x} y2={EJE} className="trazo" strokeWidth={GROSO_EJE} />
          {[hitos[0], hitos[4]].map((h) => (
            <line
              key={`tapa-${h.nombre}`}
              x1={h.x}
              y1={EJE - BRAZO}
              x2={h.x}
              y2={EJE + BRAZO}
              className="trazo"
              strokeWidth="2"
            />
          ))}

          {/* Caja intercuartilica. El hover aclara el relleno y nada mas. */}
          <rect
            x={hitos[1].x}
            y={TOPE}
            width={Math.max(hitos[3].x - hitos[1].x, 1)}
            height={MEDIO * 2}
            style={{
              fill: cajaHover ? COLOR.barraHover : COLOR.caja,
              cursor: 'pointer',
              transition: 'fill 140ms ease-out',
            }}
            className="trazo-barra"
            strokeWidth="2"
            onMouseEnter={() => setCajaHover(true)}
            onMouseMove={
              verTip
                ? (evento) =>
                    verTip(evento, [
                      'Caja intercuartílica',
                      `Q1 = ${formatear(tabla.q1, dec)} · Q3 = ${formatear(tabla.q3, dec)}`,
                      `RIC = Q3 − Q1 = ${formatear(tabla.q3 - tabla.q1, dec)}`,
                    ])
                : undefined
            }
            onMouseLeave={() => {
              ocultarTip?.();
              setCajaHover(false);
            }}
          />
          <line x1={hitos[2].x} y1={TOPE} x2={hitos[2].x} y2={BASE} className="trazo" strokeWidth="3" />

          {/* Media aritmetica: cruz en acento sobre la caja. Se dibuja dos
              veces, primero una marca clara mas gruesa que hace de contorno y
              encima el acento, para que resalte sobre el relleno de la caja. */}
          <g
            style={{ stroke: 'var(--superficie)' }}
            strokeWidth="4.5"
            strokeLinecap="round"
            onMouseMove={
              verTip
                ? (evento) =>
                    verTip(evento, ['Media aritmética', `x̄ = ${formatear(tabla.media)}`, `Mediana = ${formatear(tabla.mediana, dec)}`])
                : undefined
            }
            onMouseLeave={() => ocultarTip?.()}
          >
            <line x1={px(tabla.media) - 7} y1={EJE - 7} x2={px(tabla.media) + 7} y2={EJE + 7} />
            <line x1={px(tabla.media) - 7} y1={EJE + 7} x2={px(tabla.media) + 7} y2={EJE - 7} />
          </g>
          <g style={{ stroke: COLOR.acento }} strokeWidth="2.5" strokeLinecap="round" pointerEvents="none">
            <line x1={px(tabla.media) - 7} y1={EJE - 7} x2={px(tabla.media) + 7} y2={EJE + 7} />
            <line x1={px(tabla.media) - 7} y1={EJE + 7} x2={px(tabla.media) + 7} y2={EJE - 7} />
          </g>
          {/* El valor va SOBRE la caja, no dentro: sobre el relleno el acento
              pierde contraste, y arriba siempre hay fondo de la tarjeta. */}
          <text
            x={anclar(px(tabla.media), 34)}
            y={TOPE - 7}
            textAnchor="middle"
            style={{ ...estilos.textoValor, fill: COLOR.acento }}
            pointerEvents="none"
          >
            {formatear(tabla.media)}
          </text>

          {/* Etiquetas de las magnitudes clave */}
          {rotulables.map((h) => (
            <g key={`hito-${h.nombre}`} pointerEvents="none">
              <line x1={h.x} y1={EJE} x2={h.x} y2={EJE + 7} className="trazo" strokeWidth="1" />
              <text
                x={anclar(h.x, 26)}
                y={EJE + 74}
                textAnchor="middle"
                style={{ ...estilos.textoEje, fontWeight: 700 }}
              >
                {h.nombre}
              </text>
              <text x={anclar(h.x, 26)} y={EJE + 88} textAnchor="middle" style={estilos.textoValor}>
                {formatear(h.valor, dec)}
              </text>
            </g>
          ))}
        </>
      )}
    </TarjetaGrafica>
  );
}

export default CajaBigotes;
