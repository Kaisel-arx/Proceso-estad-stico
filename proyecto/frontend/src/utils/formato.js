// Presentacion numerica unificada de la aplicacion.
//
// REGLA: todo resultado estadistico se muestra con DECIMALES decimales. El motor de
// calculo sigue trabajando a su propia precision (ver stats/frecuencias.js) y no se
// redondea aqui: el redondeo es solo de pantalla.
//
// Los recuentos (n, k, f, fa) y los limites de clase (ii, is) se exceptuan a proposito:
// son magnitudes enteras por naturaleza y mostrarlas como 8,00 solo anade ruido. Para
// esos casos se pasa DECIMALES_ENTERO, o 0 directamente.

export const DECIMALES = 2;
export const DECIMALES_ENTERO = 0;

const LOCALES = 'es-ES';

// Formatea con separador decimal coma y, como minimo y maximo, los mismos decimales:
// asi un entero se ve 0,00 y no 0, que es lo que pide la regla de dos decimales.
export function formatear(valor, decimales = DECIMALES) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '';
  return valor.toLocaleString(LOCALES, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}
