import { useState } from 'react';
import Histograma from '../graficas/Histograma';
import CajaBigotes from '../graficas/CajaBigotes';
import PoligonoFrecuencias from '../graficas/PoligonoFrecuencias';
import FrecuenciaRelativa from '../graficas/FrecuenciaRelativa';
import PastelFrecuencias from '../graficas/PastelFrecuencias';

const GRAFICAS = [
  { id: 'histograma', etiqueta: 'Histograma', render: Histograma },
  { id: 'caja', etiqueta: 'Caja y bigotes', render: CajaBigotes },
  { id: 'poligono', etiqueta: 'Polígono y suavizada', render: PoligonoFrecuencias },
  { id: 'relativa', etiqueta: 'Frecuencia relativa', render: FrecuenciaRelativa },
  { id: 'pastel', etiqueta: 'Pastel de frecuencias', render: PastelFrecuencias },
];

// Capas superponibles al histograma. Cada una anade una serie encima de las
// barras sin ocultar el histograma base, que es como se estudia en el curso.
const CAPAS = [
  { id: 'poligono', etiqueta: 'Polígono de frecuencias' },
  { id: 'suavizada', etiqueta: 'Curva suavizada' },
];

// Seleccion por omision: todas las graficas encendidas salvo la de frecuencia
// relativa, que queda disponible pero apagada para no saturar la primera vista.
const SELECCION_INICIAL = Object.fromEntries(GRAFICAS.map((g) => [g.id, g.id !== 'relativa']));

// Chip de seleccion: casilla nativa discreta + etiqueta; el estado activo se
// pinta con la clase CSS (que tambien anima el borde y el color).
function ChipGrafica({ activo, onChange, children }) {
  return (
    <label className={`opcion-grafica${activo ? ' opcion-grafica--activa' : ''}`}>
      <input type="checkbox" checked={activo} onChange={onChange} />
      {children}
    </label>
  );
}

/**
 * Bento inferior de graficas: barra de controles en una sola fila (contador,
 * selector multiple de graficas, divisor, capas sobre el histograma y
 * acciones Todas/Ninguna) y rejilla flexible de figuras con su interpretacion
 * automatica. Recibe la tabla ya calculada y el indice de clase activo desde
 * Workspace, que lo comparte con el hover de las filas de la tabla: asi se
 * logra el resaltado cruzado entre tabla y graficas en ambos sentidos.
 */
function GraficasEstadisticas({ tabla, claseActiva, onClaseActiva }) {
  const [seleccion, setSeleccion] = useState(SELECCION_INICIAL);
  // Capas superpuestas al histograma: apagadas por omision para no duplicar
  // la linea de marca de clase que ya trae el histograma base.
  const [capas, setCapas] = useState({ poligono: false, suavizada: false });

  if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) return null;

  const alternar = (id) => setSeleccion((previos) => ({ ...previos, [id]: !previos[id] }));
  const alternarCapa = (id) => setCapas((previas) => ({ ...previas, [id]: !previas[id] }));
  const activas = GRAFICAS.filter((g) => seleccion[g.id]);

  return (
    <section>
      <div className="graficas-barra">
        <p className="etiqueta-seccion graficas-cuenta">
          Gráficas · {activas.length} de {GRAFICAS.length}
        </p>

        <div className="graficas-selector">
          {GRAFICAS.map((g) => (
            <ChipGrafica key={g.id} activo={seleccion[g.id]} onChange={() => alternar(g.id)}>
              {g.etiqueta}
            </ChipGrafica>
          ))}
        </div>

        <span className="graficas-divisor" aria-hidden="true" />

        <div className="graficas-selector">
          <span className="graficas-capas-etiqueta">Capas</span>
          {CAPAS.map((capa) => (
            <ChipGrafica key={capa.id} activo={capas[capa.id]} onChange={() => alternarCapa(capa.id)}>
              {capa.etiqueta}
            </ChipGrafica>
          ))}
        </div>

        <div className="graficas-acciones">
          <button
            type="button"
            className="btn btn-fantasma btn-compacto"
            onClick={() => setSeleccion(Object.fromEntries(GRAFICAS.map((g) => [g.id, true])))}
          >
            Todas
          </button>
          <button
            type="button"
            className="btn btn-fantasma btn-compacto"
            onClick={() => setSeleccion(Object.fromEntries(GRAFICAS.map((g) => [g.id, false])))}
          >
            Ninguna
          </button>
        </div>
      </div>

      {activas.length === 0 ? (
        <p className="graficas-vacio">Ninguna gráfica seleccionada.</p>
      ) : (
        <div className="graficas-rejilla">
          {activas.map((g) => (
            <g.render
              key={g.id}
              tabla={tabla}
              activa={claseActiva}
              onClaseActiva={onClaseActiva}
              capas={capas}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default GraficasEstadisticas;
