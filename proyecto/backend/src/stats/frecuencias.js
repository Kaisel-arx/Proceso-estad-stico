const K_INTERVALOS = 6;

const MINIMO_DATOS = 2;

// Regla de Sturges: k = 1 + 3.322 * log10(n), redondeado al entero mas proximo y con
// suelo en 1. Es el unico origen del numero de intervalos, en paridad con el frontend.
function intervalosSturges(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return K_INTERVALOS;
  return Math.max(1, Math.round(1 + 3.322 * Math.log10(n)));
}

// Extension de los limites hacia los extremos del intervalo.
// El curso define Li = ii - 0.5 y Ls = is + 0.5 para datos enteros: los limites reales
// abren medio unidad a cada lado para que las clases parezcan contiguas.
const DESPLAZAMIENTO_ENTERO = 0.5;

// Redondea a un numero con N decimales (evita ruido de punto flotante)
function redondear(valor, decimales = 2) {
  return Number(valor.toFixed(decimales));
}

// Calcula la amplitud del intervalo (i) para cubrir el Rango con k clases
function calcularAmplitud(rango, k, datosEnteros) {
  const ampBruta = rango / k;

  // Caso extremo: todos los datos son iguales (rango = 0)
  if (ampBruta === 0) return datosEnteros ? 1 : 0.5;

  // Datos enteros -> amplitud entera redondeada hacia arriba
  if (datosEnteros) return Math.ceil(ampBruta);

  // Datos decimales -> amplitud de 2 decimales, redondeada hacia arriba
  return Math.ceil(ampBruta * 100) / 100;
}

// Nucleo de todas las medidas de posicion: interpolacion lineal dentro del intervalo de
// clase que la contiene.
//   X = Li + A * ((posicion - fa anterior) / (fa - fa anterior))
// Li es el limite inferior real (ii - 0.5), no el limite de clase ii, y A es la amplitud.
function interpolarEnIntervalo({ filas, amplitud }, posicion) {
  if (!Array.isArray(filas) || filas.length === 0) return null;
  if (typeof posicion !== 'number' || !Number.isFinite(posicion)) return null;

  if (posicion <= 0) {
    const primera = filas[0];
    return { valor: redondear(primera.limiteInferiorReal, 4), fila: primera };
  }

  const fila = filas.find((f) => posicion <= f.acumulada);

  // Posicion mas alla del ultimo acumulado: se devuelve el limite superior real del extremo
  if (!fila) {
    const ultima = filas[filas.length - 1];
    return { valor: redondear(ultima.limiteSuperiorReal, 4), fila: ultima };
  }

  const faAnterior = fila.acumulada - fila.frecuencia;
  const fraccion = fila.frecuencia > 0 ? (posicion - faAnterior) / fila.frecuencia : 0;

  return {
    valor: redondear(fila.limiteInferiorReal + fraccion * amplitud, 4),
    fila,
  };
}

// Definicion de cada familia de medidas de posicion segun el curso.
// El divisor fija la posicion: kn/4 para cuartiles, kn/10 para deciles, kn/100 para
// percentiles, y n/2 (divisor 2) para la mediana.
// max cubre el limite teorico completo de cada familia: Q4 = 100 % = Xmax,
// D10 = 100 % = Xmax, P100 = 100 % = Xmax. k = 0 es la omision y la gestiona la
// UI (K_OMISION), por eso el motor conserva min = 1: con 0 devuelve null.
const TIPOS_POSICION = {
  cuartil: { etiqueta: 'Cuartil', simbolo: 'Q', divisor: 4, min: 1, max: 4, atajo: [1, 2, 3, 4] },
  decil: { etiqueta: 'Decil', simbolo: 'D', divisor: 10, min: 1, max: 10, atajo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  percentil: {
    etiqueta: 'Percentil',
    simbolo: 'P',
    divisor: 100,
    min: 1,
    max: 100,
    atajo: [1, 5, 10, 25, 50, 75, 90, 95, 99, 100],
  },
  mediana: { etiqueta: 'Mediana', simbolo: 'Md', divisor: 2, min: 1, max: 1, atajo: [1] },
};

// Calcula una medida de posicion a partir del tipo y de k.
//   posicion = (k * n) / divisor
//   X_k = Li + A * ((posicion - fa anterior) / (fa - fa anterior))
// Devuelve null si el tipo no existe, si k no es entero o esta fuera de rango, o si la
// tabla no es utilizable. Incluye la posicion y el intervalo de clase para poder mostrarlos.
function medidaDePosicion(base, tipo, k) {
  const config = TIPOS_POSICION[tipo];
  if (!config) return null;
  if (!base || !Array.isArray(base.filas) || base.filas.length === 0) return null;
  if (typeof k !== 'number' || !Number.isFinite(k) || !Number.isInteger(k)) return null;
  if (k < config.min || k > config.max) return null;

  const { n, amplitud } = base;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;

  const posicion = (k * n) / config.divisor;
  const interpolado = interpolarEnIntervalo(base, posicion);
  if (!interpolado) return null;

  const { fila, valor } = interpolado;
  return {
    tipo,
    k,
    etiqueta: config.etiqueta,
    simbolo: config.simbolo,
    nombre: config.simbolo === 'Md' ? 'Md' : `${config.simbolo}${k}`,
    divisor: config.divisor,
    posicion: redondear(posicion, 4),
    valor,
    clase: fila.clase,
    limiteInferior: fila.limiteInferior,
    limiteSuperior: fila.limiteSuperior,
    limiteInferiorReal: fila.limiteInferiorReal,
    limiteSuperiorReal: fila.limiteSuperiorReal,
  };
}

// Percentil de datos agrupados por interpolacion lineal dentro del intervalo de clase:
//   P(k) = Li + ((posicion - F(anterior)) / f) * i   con posicion = (k / 100) * n
// Li es el limite inferior real (ii - 0.5), no el limite de clase ii.
function percentilAgrupado({ filas, n, amplitud }, k) {
  if (!Array.isArray(filas) || filas.length === 0 || n === 0) return null;
  if (typeof k !== 'number' || !Number.isFinite(k) || k < 0 || k > 100) return null;

  const interpolado = interpolarEnIntervalo({ filas, amplitud }, (k / 100) * n);
  return interpolado ? interpolado.valor : null;
}

// Frecuencia suavizada por promedio ponderado de tres puntos:
//   fs = (f_anterior + 2f + f_posterior) / 4
// En los extremos se replica la propia frecuencia del vecino ausente, de modo que una serie
// constante se suaviza a si misma; con relleno en cero daria 3f/4, f, f, 3f/4.
function frecuenciasSuavizadas(filas) {
  return filas.map((fila, j) => {
    const anterior = filas[j - 1] ? filas[j - 1].frecuencia : fila.frecuencia;
    const posterior = filas[j + 1] ? filas[j + 1].frecuencia : fila.frecuencia;
    return redondear((anterior + 2 * fila.frecuencia + posterior) / 4, 4);
  });
}

// Posicion que ocupa la mediana en la distribucion: n / 2.
// Es el indice con el que despues se localiza el intervalo de clase que la contiene.
function posicionMediana(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return redondear(n / 2, 2);
}

// Moda de datos agrupados por interpolacion:
//   Mo = Li + (f1 - f0) / ((f1 - f0) + (f1 - f2)) * i
// Li es el limite inferior real de la clase modal. Si la clase modal es la primera,
// f0 vale 0 porque no hay clase anterior.
// Devuelve null si no hay moda: ninguna clase se repite.
// El denominador nunca es 0: se toma la primera clase modal, de modo que f1 > f0.
function modaAgrupada({ filas, amplitud }) {
  if (!Array.isArray(filas) || filas.length === 0) return null;

  const maxFrecuencia = Math.max(...filas.map((f) => f.frecuencia));

  // Todas las clases con f = 1: ningun valor se repite
  if (maxFrecuencia <= 1) return null;

  const j = filas.findIndex((f) => f.frecuencia === maxFrecuencia);
  const f1 = filas[j].frecuencia;
  const f0 = j > 0 ? filas[j - 1].frecuencia : 0;
  const f2 = j < filas.length - 1 ? filas[j + 1].frecuencia : 0;

  return redondear(
    filas[j].limiteInferiorReal + ((f1 - f0) / ((f1 - f0) + (f1 - f2))) * amplitud,
    4
  );
}

// Construye la tabla de distribucion de frecuencias con k calculado por Sturges
function construirFrecuencias(valores) {
  if (!Array.isArray(valores) || valores.length === 0) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const n = ordenados.length;
  const xMin = ordenados[0];
  const xMax = ordenados[n - 1];
  const rango = redondear(xMax - xMin);
  const k = intervalosSturges(n);
  // Si los datos crudos son enteros, los limites de clase tambien lo son
  const datosEnteros = Number.isInteger(xMin) && Number.isInteger(xMax);
  const amplitud = calcularAmplitud(rango, k, datosEnteros);

  // Con datos enteros el curso extiende los limites medio unidad; con decimales, medio
  // intervalo es la unica extension que no parte la clase en dos.
  const desplazamiento = datosEnteros ? DESPLAZAMIENTO_ENTERO : amplitud / 2;

  let limiteInferior = xMin;
  const filas = [];
  let acumulada = 0;

  for (let j = 0; j < k; j++) {
    const li = j === 0 ? xMin : limiteInferior;
    const ls = redondear(li + amplitud);
    const esUltimo = j === k - 1;

    // El ultimo intervalo es cerrado en LS para no perder el valor Xmax
    const frecuencia = ordenados.filter((v) =>
      esUltimo ? v >= li && v <= ls : v >= li && v < ls
    ).length;

    acumulada += frecuencia;
    // Frecuencia relativa en porcentaje: fr = f * 100 / n. Se redondea a 2 decimales,
    // que es la precision con la que se presenta en la tabla.
    const relativa = n > 0 ? redondear((frecuencia * 100) / n, 2) : 0;

    filas.push({
      clase: j + 1,
      limiteInferior: li,
      limiteSuperior: ls,
      limiteInferiorReal: redondear(li - desplazamiento, 4), // Li = ii - 0.5
      limiteSuperiorReal: redondear(ls + desplazamiento, 4), // Ls = is + 0.5
      marcaClase: redondear((li + ls) / 2), // xi = (LI + LS) / 2
      frecuencia, // fi
      acumulada, // Fi
      relativa, // fr = f * 100 / n
      // fr ya es un porcentaje, asi que la antigua columna f% quedo redundante y se
      // elimino de la tabla. El campo se conserva como espejo de fr unicamente para
      // satisfacer la columna porcentaje REAL NOT NULL del esquema, que no se toca.
      porcentaje: relativa,
    });

    limiteInferior = ls;
  }

  // Frecuencia suavizada: fs = (f_anterior + 2f + f_posterior) / 4
  const suavizadas = frecuenciasSuavizadas(filas);
  filas.forEach((f, j) => {
    f.suavizada = suavizadas[j];
  });

  // Media aritmetica de datos agrupados: x barra = sumatoria(fi * xi) / n
  const sumaProducto = redondear(
    filas.reduce((s, f) => s + f.frecuencia * f.marcaClase, 0),
    4
  );
  const media = n > 0 ? redondear(sumaProducto / n, 4) : 0;

  // Columnas de apoyo para el producto de frecuencias y para la varianza
  filas.forEach((f) => {
    const delta = redondear(f.marcaClase - media, 4);
    const desviacion = redondear(delta * delta, 4);

    f.producto = redondear(f.frecuencia * f.marcaClase, 2);
    // (fr)(xm) = fr * xm / 100. Como fr viene en porcentaje, dividir entre 100 lo
    // devuelve a la escala de la proporcion, y asi la suma de la columna es la media.
    f.relativaProducto = redondear((f.relativa * f.marcaClase) / 100, 4);
    f.desviacion = desviacion;
    f.desviacionPonderada = redondear(desviacion * f.frecuencia, 4);
  });

  const sumaDesviacionPonderada = redondear(
    filas.reduce((s, f) => s + f.desviacionPonderada, 0),
    4
  );

  // Media ponderada: x virgulilla = sumatoria(fr * xm) / 100, que es justo lo que suma
  // la columna (fr)(xm) fila a fila. Al estar fr en porcentaje, esa division deja el
  // resultado en la escala de la proporcion y por eso coincide con la media aritmetica.
  // Se suman los productos SIN redondear y se redondea una sola vez al final:
  // sumar los (fr)(xm) ya redondeados de la tabla arrastra el error de cada fila.
  const mediaPonderada = redondear(
    filas.reduce((s, f) => s + (f.frecuencia / n) * f.marcaClase, 0),
    4
  );

  const varianzaPoblacional = n > 0 ? redondear(sumaDesviacionPonderada / n, 4) : 0;
  const varianzaMuestral = n > 1 ? redondear(sumaDesviacionPonderada / (n - 1), 4) : 0;
  // Sigma se calcula una sola vez y sin redondear: la desviacion mostrada es su redondeo,
  // pero el coeficiente de variacion se deriva del valor sin redondear para no arrastrar
  // dos redondeos encadenados.
  const sigmaExacto = Math.sqrt(sumaDesviacionPonderada / n);
  const desviacionPoblacional = redondear(sigmaExacto, 4);
  const desviacionMuestral = redondear(Math.sqrt(varianzaMuestral), 4);

  // Coeficiente de variacion: Cv = (sigma / x barra) * 100
  // Sin media no hay coeficiente: se devuelve null en vez de dividir por cero.
  // Con media negativa el coeficiente sale negativo, que es el resultado literal de la
  // formula; el uso habitual toma el valor absoluto, asi que se expone el dato tal cual.
  const coeficienteVariacion =
    media !== 0 ? redondear((sigmaExacto / media) * 100, 4) : null;

  const base = { filas, n, amplitud };

  // La mediana es la misma familia que cuartiles, deciles y percentiles con divisor 2
  const detalleMediana = medidaDePosicion(base, 'mediana', 1);

  return {
    n,
    xMin,
    xMax,
    rango,
    k,
    amplitud,
    datosEnteros,
    desplazamiento,
    media,
    mediaPonderada,
    sumaProducto,
    sumaDesviacionPonderada,
    varianzaPoblacional,
    varianzaMuestral,
    desviacionPoblacional,
    desviacionMuestral,
    coeficienteVariacion,
    q1: percentilAgrupado(base, 25),
    mediana: percentilAgrupado(base, 50),
    q3: percentilAgrupado(base, 75),
    p17: percentilAgrupado(base, 17),
    posicionMediana: posicionMediana(n),
    detalleMediana,
    moda: modaAgrupada({ filas, amplitud }),
    filas,
  };
}

module.exports = {
  construirFrecuencias,
  percentilAgrupado,
  posicionMediana,
  modaAgrupada,
  frecuenciasSuavizadas,
  medidaDePosicion,
  TIPOS_POSICION,
  intervalosSturges,
  K_INTERVALOS,
  MINIMO_DATOS,
};
