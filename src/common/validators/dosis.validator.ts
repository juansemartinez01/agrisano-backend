import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';
import {
  CANTIDAD_STOCK_DECIMALES,
  CANTIDAD_STOCK_MAX,
  esCantidadStockValida,
} from './cantidad-stock.validator';

/**
 * Dosis de aplicaciones químicas (cabecera y detalle): columnas
 * numeric(13,6), la misma escala que las cantidades de stock. En unidades
 * como L/L o kg/L una dosis típica (0.25 mL/L = 0.00025 L/L) no entra en 3
 * decimales y Postgres la redondeaba en silencio a 0.000.
 *
 * Es la misma regla que `IsCantidadStock` (`> 0`, a lo sumo 6 decimales,
 * dentro del rango de la columna, sin ruido de float); se expone con otro
 * nombre para que el DTO diga qué campo es y para poder divergir si la dosis
 * llega a necesitar otra regla.
 */
export const DOSIS_DECIMALES = CANTIDAD_STOCK_DECIMALES;
export const DOSIS_MAX = CANTIDAD_STOCK_MAX;

export function esDosisValida(value: unknown): boolean {
  return esCantidadStockValida(value);
}

export function IsDosis(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDosis',
      validator: {
        validate: (value: unknown): boolean => esDosisValida(value),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a number greater than 0 with at most ${DOSIS_DECIMALES} decimal places and not greater than ${DOSIS_MAX}`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
