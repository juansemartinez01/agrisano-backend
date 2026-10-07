import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * Cantidades de stock químico (aplicaciones, ajustes e ingreso de lotes):
 * columnas numeric(13,6). 6 decimales permiten repartir un consumo chico
 * (ej: 3 mL = 0.003 L) entre muchos chunks de 200 targets sin que ninguno
 * caiga a 0; 13 de precisión conservan los 7 dígitos enteros que tenía el
 * numeric(10,3) anterior.
 */
export const CANTIDAD_STOCK_DECIMALES = 6;
export const CANTIDAD_STOCK_MAX = 9_999_999.999999;

const ESCALA = 10 ** CANTIDAD_STOCK_DECIMALES;

/**
 * `> 0`, a lo sumo 6 decimales, y dentro del rango de la columna.
 *
 * No usa `@IsNumber({ maxDecimalPlaces })` a propósito: en class-validator
 * 0.14 ese chequeo parte `value.toString()` por '.', y la notación
 * exponencial rompe la cuenta — `1e-7` lanza TypeError (un 500 en vez de un
 * 400) y `1.5e-7`, que tiene 8 decimales, pasa. Redondear a la escala y
 * comparar no depende de cómo JS imprima el número, y además rechaza el ruido
 * de float (`0.1 + 0.2 = 0.30000000000000004`), que de otro modo se
 * redondearía sin avisar al persistir.
 */
export function esCantidadStockValida(value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value <= 0 || value > CANTIDAD_STOCK_MAX) return false;
  return Math.round(value * ESCALA) / ESCALA === value;
}

export function IsCantidadStock(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCantidadStock',
      validator: {
        validate: (value: unknown): boolean => esCantidadStockValida(value),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a number greater than 0 with at most ${CANTIDAD_STOCK_DECIMALES} decimal places and not greater than ${CANTIDAD_STOCK_MAX}`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
