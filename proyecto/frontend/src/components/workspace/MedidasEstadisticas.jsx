import { formatear } from '../../utils/formato';
import Tarjeta from '../ui/Tarjeta';
import { Medida, TONOS } from './comunes';

// Las medidas resumen en dos tarjetas con acento de color: rose para la
// tendencia central y plum para la variabilidad, siguiendo la paleta
// maestra de StatLab. Las rejillas interiores usan clases CSS para que el
// bento pueda centrarlas verticalmente cuando la tarjeta se estira.
function MedidasEstadisticas({ tabla }) {
  return (
    <>
      <Tarjeta titulo="Medidas de Tendencia Central" acento="rosa">
        <div className="rejilla-datos rejilla-datos--2">
          <Medida
            icono="media"
            tono={TONOS.central}
            etiqueta="Media aritmética (x̄)"
            valor={formatear(tabla.media)}
            descripcion="x barra = sumatoria(f * xm) / n"
          />
          <Medida
            icono="ponderada"
            tono={TONOS.central}
            etiqueta="Media ponderada (x̃)"
            valor={formatear(tabla.mediaPonderada)}
            descripcion="x virgulilla = sumatoria(fr * xm) / 100. Con fr en porcentaje, dividir entre 100 lo equivale a la media aritmética"
            nota="Coincide con la media aritmética: es la misma magnitud"
          />
          <Medida
            icono="mediana"
            tono={TONOS.central}
            etiqueta="Mediana (Md)"
            valor={formatear(tabla.mediana)}
            descripcion="Md = Li + ((n/2 - fa anterior) / f) * i"
          />
          <Medida
            icono="moda"
            tono={TONOS.central}
            etiqueta="Moda (Mo)"
            valor={formatear(tabla.moda)}
            vacio={tabla.moda === null}
            descripcion="Ningún valor se repite, por lo que la distribución no tiene moda"
          />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Medidas de Variabilidad" acento="ciruela">
        <div className="rejilla-datos rejilla-datos--3">
          <Medida
            icono="varianza"
            tono={TONOS.variabilidad}
            etiqueta="Varianza (σ²)"
            valor={formatear(tabla.varianzaPoblacional)}
            descripcion="sigma al cuadrado = sumatoria((xm - x barra)^2 * f) / n"
          />
          <Medida
            icono="desviacion"
            tono={TONOS.variabilidad}
            etiqueta="Desviación estándar (σ)"
            valor={formatear(tabla.desviacionPoblacional)}
            descripcion="sigma = raiz cuadrada de sigma al cuadrado"
          />
          <Medida
            icono="coeficiente"
            tono={TONOS.variabilidad}
            etiqueta="Coeficiente de variación (Cv)"
            valor={tabla.coeficienteVariacion === null ? '' : `${formatear(tabla.coeficienteVariacion)} %`}
            vacio={tabla.coeficienteVariacion === null}
            descripcion="La media es cero, de modo que el coeficiente no está definido"
          />
        </div>
      </Tarjeta>
    </>
  );
}

export default MedidasEstadisticas;
