import { COLOR, Y1, GROSO_BARRA } from './lienzo';

/**
 * Barra de intervalo completo con borde propio y cerrado.
 *
 * Cada barra es un <rect> autonomo con su `stroke`: los cuatro lados se
 * dibujan siempre, incluso los que quedan pegados a la barra vecina o a una
 * barra de altura cero. No hay ningun contorno compartido ni envolvente del
 * conjunto, asi que cada columna se lee como un rectangulo delimitado por
 * completo.
 *
 * El hover (propio o llegado desde la tabla) aclara el relleno; el borde no
 * se toca, porque un contorno que palidece al pasar el cursor hace perder la
 * referencia de la columna. lineas alimenta el tooltip HTML.
 */
function Barra({ x, ancho, alto, gradiente, activa, lineas, onActivar, onDescansar, verTip, ocultarTip }) {
  return (
    <rect
      x={x}
      y={Y1 - alto}
      width={ancho}
      height={alto}
      style={{
        fill: activa ? COLOR.barraHover : `url(#${gradiente})`,
        cursor: 'pointer',
        transition: 'fill 140ms ease-out',
      }}
      className="trazo-barra"
      strokeWidth={GROSO_BARRA}
      onMouseEnter={onActivar}
      onMouseMove={verTip ? (evento) => verTip(evento, lineas) : undefined}
      onMouseLeave={() => {
        ocultarTip?.();
        onDescansar();
      }}
    />
  );
}

export default Barra;
