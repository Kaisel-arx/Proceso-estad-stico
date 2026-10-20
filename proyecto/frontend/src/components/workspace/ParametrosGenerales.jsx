import { formatear, DECIMALES, DECIMALES_ENTERO } from '../../utils/formato';

// El bloque "Datos iniciales" describe la geometria de los datos, no un
// resultado estadistico: sigue la regla de los limites de clase y se
// mantiene entero cuando los datos crudos lo son.
function ParametrosGenerales({ tabla }) {
  const dec = tabla.datosEnteros ? DECIMALES_ENTERO : DECIMALES;

  return (
    <>
      <p className="etiqueta-seccion">Datos iniciales</p>
      <div className="rejilla-datos rejilla-datos--6">
        <div className="dato">
          <span className="dato-etiqueta">n (total de datos)</span>
          <span className="dato-valor">{tabla.n}</span>
        </div>
        <div className="dato">
          <span className="dato-etiqueta">Xmin</span>
          <span className="dato-valor">{formatear(tabla.xMin, dec)}</span>
        </div>
        <div className="dato">
          <span className="dato-etiqueta">Xmax</span>
          <span className="dato-valor">{formatear(tabla.xMax, dec)}</span>
        </div>
        <div className="dato">
          <span className="dato-etiqueta">Rango (R)</span>
          <span className="dato-valor">{formatear(tabla.rango, dec)}</span>
        </div>
        <div className="dato" title="Regla de Sturges: k = 1 + 3.322 * log10(n)">
          <span className="dato-etiqueta">N. intervalos (k)</span>
          <span className="dato-valor">{tabla.k}</span>
        </div>
        <div className="dato">
          <span className="dato-etiqueta">Amplitud (i)</span>
          <span className="dato-valor">{formatear(tabla.amplitud, dec)}</span>
        </div>
      </div>
    </>
  );
}

export default ParametrosGenerales;
