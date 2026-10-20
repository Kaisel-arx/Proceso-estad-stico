import { formatear } from '../../utils/formato';
import Tarjeta from '../ui/Tarjeta';
import { estilos as estilosComunes, Medida, TONOS } from './comunes';

// Familias de posicion del curso, en el orden en que se estudian: cuartil,
// decil y percentil. La mediana no entra: es la misma interpolacion con
// divisor 2 y ya se muestra fija en Tendencia Central.
export const FAMILIAS_POSICION = ['cuartil', 'decil', 'percentil'];

// k = 0 es la omision de cada familia: no se calcula y la tarjeta muestra
// "No se muestra". Vive aqui y no en TIPOS_POSICION porque el motor comparte
// sus limites con el backend.
export const K_OMISION = 0;

// k inicial de cada familia: todas arrancan apagadas ("0" = no mostrar). Se
// guarda como cadena para que el input acepte escritura libre ("", "1"...) sin
// que React imponga un cero inicial que estorbe al teclear.
export const K_INICIAL = { cuartil: '0', decil: '0', percentil: '0' };

// Etiqueta y rango de cada familia. El subindice va en <sub> para que el
// titulo reproduzca la notacion Cuartil (Q_k), Decil (D_k), Percentil (P_k).
const ETIQUETAS = {
  cuartil: { texto: 'Cuartil', simbolo: 'Q', max: 4 },
  decil: { texto: 'Decil', simbolo: 'D', max: 10 },
  percentil: { texto: 'Percentil', simbolo: 'P', max: 100 },
};

/**
 * Tarjeta de una familia de posicion con entrada manual de k:
 * un campo numerico compacto (0 = no mostrar) y el resultado calculado
 * destacado. Sin botones de atajos: el diseno queda minimalista y el calculo
 * se actualiza en tiempo real al teclear.
 *
 * El input controla texto, no un numero: asi el usuario puede borrar todo
 * (queda "") o escribir "04" mientras teclea, sin que un cero inicial
 * impuesto por el estado estorbe. La conversion a entero ocurre mas arriba,
 * en ajustarK, y solo para el calculo.
 */
function ControlPosicion({ tipo, valor, onChange, resultado }) {
  const config = ETIQUETAS[tipo];
  const id = `control-${tipo}`;
  const k = Number.parseInt(valor, 10) || K_OMISION;
  const omitido = k === K_OMISION;
  const vacio = omitido || !resultado;

  return (
    <div className="dato" style={{ gap: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <label className="dato-etiqueta" htmlFor={id}>
          {config.texto} ({config.simbolo}
          <sub>k</sub>)
        </label>
        <input
          id={id}
          type="number"
          min={K_OMISION}
          max={config.max}
          step="1"
          value={valor}
          onChange={(evento) => onChange(tipo, evento.target.value)}
          aria-label={`Valor de k para ${config.texto.toLowerCase()} (0 = no mostrar, máximo ${config.max})`}
          title={`k de 0 a ${config.max} · 0 = no mostrar`}
          className="entrada-posicion"
        />
      </div>

      <span className={`dato-valor${vacio ? ' dato-valor-vacio' : ''}`}>
        {omitido ? 'No se muestra' : !resultado ? 'No se aplica' : formatear(resultado.valor)}
      </span>
      {!omitido && resultado && (
        <span style={estilosComunes.datoNota}>
          {config.simbolo}
          {k} = {formatear(resultado.valor)}
        </span>
      )}
    </div>
  );
}

// Tarjeta de medidas de posicion: misma estructura que Variabilidad, con tres
// tarjetas internas lado a lado, el acento acero de la paleta maestra y la
// entrada manual de k.
function MedidasPosicion({ ks, medidas, ajustarK }) {
  return (
    <Tarjeta
      titulo="Medidas de Posición"
      acento="acero"
      meta="Escribe k · 0 = no mostrar"
    >
      <div className="rejilla-datos rejilla-datos--3">
        {FAMILIAS_POSICION.map((tipo) => (
          <ControlPosicion
            key={tipo}
            tipo={tipo}
            valor={ks[tipo]}
            onChange={ajustarK}
            resultado={medidas[tipo]}
          />
        ))}
      </div>
    </Tarjeta>
  );
}

export default MedidasPosicion;
