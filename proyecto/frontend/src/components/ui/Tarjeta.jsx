/**
 * Tarjeta contenedora con el acabado unico de StatLab: cabecera en degradado
 * profundo con titulo, chip de meta y (opcional) acciones de herramienta,
 * cuerpo con padding uniforme.
 * Se comparte entre la tabla de frecuencias, las medidas y las graficas para
 * que el cromo sea identico en todas las vistas.
 */
function Tarjeta({ titulo, meta, acciones, children, cuerpoEstilo, acento }) {
  return (
    <div className={`tarjeta${acento ? ` tarjeta--acento-${acento}` : ''}`}>
      <div className="tarjeta-cabecera">
        <h3 className="tarjeta-titulo">{titulo}</h3>
        <div className="tarjeta-herramientas">
          {meta && <span className="tarjeta-meta">{meta}</span>}
          {acciones}
        </div>
      </div>
      <div className="tarjeta-cuerpo" style={cuerpoEstilo}>
        {children}
      </div>
    </div>
  );
}

export default Tarjeta;
