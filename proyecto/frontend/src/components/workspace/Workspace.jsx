import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { medidaDePosicion } from '../../stats/frecuencias';
import { formatear, DECIMALES, DECIMALES_ENTERO } from '../../utils/formato';
import { descargarReportePDF } from '../../utils/reportePdf';
import ParametrosGenerales from './ParametrosGenerales';
import TablaFrecuencias from './TablaFrecuencias';
import MedidasPosicion, { FAMILIAS_POSICION, K_OMISION, K_INICIAL } from './MedidasPosicion';
import MedidasEstadisticas from './MedidasEstadisticas';
import GraficasEstadisticas from './GraficasEstadisticas';

/**
 * Area de trabajo: dashboard de ancho completo.
 *
 * Rejilla de areas nombradas (ui.css) que elimina los huecos del antiguo
 * layout de dos columnas iguales:
 *
 *   entrada   entrada     franja compacta de captura (Ingreso de datos)
 *   frec      medidas     la tabla manda el ancho; las tarjetas de medidas
 *                         se estiran para igualar su altura (flex) y el
 *                         contenido interior se centra: sin espacio muerto.
 *   graf      graf        bento inferior de graficas + interpretaciones
 *
 * El toolbar lleva los chips n / k / i (antes duplicados en la cabecera de
 * la tabla) y el boton de exportar PDF.
 *
 * Este componente es el unico propietario del estado compartido: ks (medidas
 * de posicion), claseActiva (hover sincronizado tabla <-> graficas) y
 * areaRef, desde donde salen las figuras SVG para el PDF.
 */
function Workspace({ tabla, valores, nombreProyecto = '', bloqueEntrada = null }) {
  const { usuario } = useAuth();
  const [ks, setKs] = useState(K_INICIAL);
  const [claseActiva, setClaseActiva] = useState(-1);
  const [exportando, setExportando] = useState(false);
  // Ancla del area de trabajo: de aqui salen las figuras SVG para el PDF.
  const areaRef = useRef(null);

  // El motor devuelve null si k se sale del rango, y la UI no debe romperse
  // por eso: se muestra "No se aplica". k = 0 (o el campo vacio) es la omision.
  const base = { filas: tabla.filas, n: tabla.n, amplitud: tabla.amplitud };
  // Con k = 0 la familia esta omitida: no se llama al motor, de modo que
  // tampoco hay posicion ni intervalo que mostrar.
  const medidas = Object.fromEntries(
    FAMILIAS_POSICION.map((tipo) => {
      const k = Number.parseInt(ks[tipo], 10) || K_OMISION;
      return [tipo, k === K_OMISION ? null : medidaDePosicion(base, tipo, k)];
    })
  );

  // Solo las medidas que el usuario activo (k > 0): viajan exclusivamente al
  // PDF, tanto para la seccion de Posicion del informe como para su registro.
  const posiciones = FAMILIAS_POSICION.map((tipo) => medidas[tipo]).filter(Boolean);

  const dec = tabla.datosEnteros ? DECIMALES_ENTERO : DECIMALES;

  // El input entrega texto crudo: se guarda tal cual para permitir escribir
  // con libertad (vacio, "04"...) y el numero solo se deriva para el calculo.
  // No se recorta aqui: el motor ya limita k a su rango, y la vista muestra
  // "No se aplica" cuando se sale.
  const ajustarK = (tipo, bruto) => {
    setKs((previos) => ({ ...previos, [tipo]: String(bruto).replace(/[^\d]/g, '') }));
  };

  // Reporte PDF: recoge las figuras SVG visibles del area de trabajo y las
  // entrega al generador junto con la tabla, los datos y la sesion vigente.
  const handleExportarPDF = async () => {
    const figuras = areaRef.current
      ? Array.from(areaRef.current.querySelectorAll('figure[data-reporte]'))
      : [];

    setExportando(true);
    try {
      await descargarReportePDF({
        tabla,
        valores,
        titulo: nombreProyecto.trim() || `Análisis con n = ${tabla.n}`,
        usuario: usuario?.usuario ?? '',
        figuras,
        posiciones,
      });
    } finally {
      setExportando(false);
    }
  };

  return (
    <section ref={areaRef}>
      <header className="workspace-toolbar">
        <div className="workspace-titulo-envoltura">
          <h2 className="workspace-titulo">Área de trabajo</h2>
          <div className="workspace-chips" aria-label="Parámetros generales">
            <span className="chip chip-dato">n = {tabla.n}</span>
            <span className="chip chip-dato">k = {tabla.k}</span>
            <span className="chip chip-dato">i = {formatear(tabla.amplitud, dec)}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primario"
          onClick={handleExportarPDF}
          disabled={exportando}
          title="Descargar un informe PDF con la tabla, las medidas y las gráficas"
        >
          {exportando ? 'Generando…' : 'Exportar PDF'}
        </button>
      </header>

      <div className="bento">
        {/* Franja superior a todo el ancho: captura compacta de datos. */}
        <div className="bento-entrada">{bloqueEntrada}</div>

        {/* Columna izquierda: distribucion de frecuencias. La tarjeta crece en
            vertical para que su pie se alinee con el fondo del bento. */}
        <div className="bento-frecuencias tarjeta">
          <div className="tarjeta-cabecera">
            <h3 className="tarjeta-titulo">Distribución de frecuencias</h3>
          </div>
          <div className="tarjeta-cuerpo tarjeta-cuerpo--frecuencias">
            <ParametrosGenerales tabla={tabla} />
            <hr className="separador" />
            <TablaFrecuencias tabla={tabla} claseActiva={claseActiva} onClaseActiva={setClaseActiva} />
          </div>
        </div>

        {/* Columna derecha: medidas. Cada tarjeta se estira (flex) para cubrir
            el sobrante de altura y centrar su contenido: cero huecos. */}
        <div className="bento-medidas">
          <MedidasEstadisticas tabla={tabla} />
          <MedidasPosicion
            tabla={tabla}
            base={base}
            ks={ks}
            medidas={medidas}
            ajustarK={ajustarK}
          />
        </div>

        {/* Bento inferior a todo el ancho: graficas con sus interpretaciones. */}
        <div className="bento-graficas">
          <GraficasEstadisticas
            tabla={tabla}
            claseActiva={claseActiva}
            onClaseActiva={setClaseActiva}
          />
        </div>
      </div>
    </section>
  );
}

export default Workspace;
