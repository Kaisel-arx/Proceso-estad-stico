import { COLOR } from './lienzo';

// Degradado vertical del relleno de las barras. Es sutil a proposito: el tono
// base sigue siendo el slate de la paleta y lo unico que cambia es un punto
// mas de luz en el borde superior, que da volumen sin apartar la figura de la
// referencia. El id lo aporta el caller (useId) porque las cinco graficas
// viven en la misma pagina y un id repetido en dos <defs> haria que una usara
// el gradiente de la otra.
function DegradadoBarra({ id }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: COLOR.barraAlto }} />
        <stop offset="100%" style={{ stopColor: COLOR.barra }} />
      </linearGradient>
    </defs>
  );
}

export default DegradadoBarra;
