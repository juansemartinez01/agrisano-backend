import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

// YYYY-MM-DDTHH:mm[:ss[.fff…]] seguido de `Z` o de un offset ±HH:mm / ±HHmm.
const FECHA_HORA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Instante ISO-8601 con fecha, hora y zona horaria explícitas.
 *
 * `@IsISO8601()` deja pasar una fecha sola ("2026-10-28") y una hora sin zona;
 * ambas se interpretarían en silencio (medianoche, o la zona del servidor), lo
 * que es inaceptable para medir cuánto tardó una aplicación.
 */
export function esFechaHoraConZona(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = FECHA_HORA_CON_ZONA.exec(value);
  if (!m) return false;

  const [, y, mo, d, h, mi, s] = m;
  const hora = Number(h);
  const minuto = Number(mi);
  const segundo = s === undefined ? 0 : Number(s);
  if (hora > 23 || minuto > 59 || segundo > 59) return false;

  // Día real del calendario (rechaza 2026-02-30).
  const anio = Number(y);
  const mes = Number(mo);
  const dia = Number(d);
  const ref = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    ref.getUTCFullYear() !== anio ||
    ref.getUTCMonth() !== mes - 1 ||
    ref.getUTCDate() !== dia
  ) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

export function IsFechaHoraConZona(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isFechaHoraConZona',
      validator: {
        validate: (value: unknown): boolean => esFechaHoraConZona(value),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be an ISO 8601 date-time with time and timezone (e.g. 2026-10-28T08:00:00-03:00 or ...Z)`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
