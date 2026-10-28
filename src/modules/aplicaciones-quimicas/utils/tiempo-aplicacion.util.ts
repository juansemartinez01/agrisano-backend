import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';

/** Desfase tolerado del reloj del celular del operario respecto del servidor. */
export const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

/** Duración máxima entre inicio y fin: corta errores de tipeo de fecha. */
export const DURACION_MAXIMA_MS = 24 * 60 * 60 * 1000;

export interface TiempoAplicacion {
  inicio: Date;
  fin: Date;
}

/** Horarios ya guardados de una aplicación (null en las anteriores a la feature). */
export interface TiempoAplicacionGuardado {
  inicio: Date | null;
  fin: Date | null;
}

export interface ResolverTiempoParams {
  /** Lo que envió el cliente (ISO con zona, ya validado por el DTO). */
  inicio?: string | Date | null;
  fin?: string | Date | null;
  ahora: Date;
  /**
   * Horarios guardados. Ausente = alta (inicio obligatorio, fin por defecto
   * ahora). Presente = corrección: lo enviado pisa lo guardado y el resto se
   * completa con lo guardado.
   */
  actual?: TiempoAplicacionGuardado | null;
}

function horarioInvalido(message: string): AppError {
  return new AppError({
    code: ErrorCodes.APLICACION_HORARIO_INVALIDO,
    message,
    status: 422,
  });
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Calcula y valida el par inicio/fin de una aplicación. Es el único lugar que
 * decide qué horarios se persisten (en todos los puntos de escritura), y
 * `fecha_hora` se guarda siempre igual al `fin` devuelto.
 *
 * Reglas, en orden: completar el par → inicio <= fin → fin no futuro (más allá
 * de la tolerancia; solo cuando es alta o el fin fue enviado) → duración <= 24 h.
 */
export function resolverTiempoAplicacion(
  params: ResolverTiempoParams,
): TiempoAplicacion {
  const { ahora, actual } = params;
  const enviadoInicio =
    params.inicio === undefined || params.inicio === null
      ? null
      : toDate(params.inicio);
  const enviadoFin =
    params.fin === undefined || params.fin === null ? null : toDate(params.fin);

  let inicio: Date | null;
  let fin: Date | null;
  if (actual === undefined) {
    if (!enviadoInicio) {
      throw horarioInvalido('fecha_hora_inicio es obligatoria');
    }
    inicio = enviadoInicio;
    fin = enviadoFin ?? ahora;
  } else {
    inicio = enviadoInicio ?? actual?.inicio ?? null;
    fin = enviadoFin ?? actual?.fin ?? null;
    if (!inicio || !fin) {
      throw horarioInvalido(
        'La aplicación no tiene horarios registrados: informá fecha_hora_inicio y fecha_hora_fin',
      );
    }
  }

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    throw horarioInvalido(
      'fecha_hora_inicio y fecha_hora_fin deben ser válidas',
    );
  }

  if (inicio.getTime() > fin.getTime()) {
    throw horarioInvalido(
      'fecha_hora_fin no puede ser anterior a fecha_hora_inicio',
    );
  }

  const validaFuturo = actual === undefined || enviadoFin !== null;
  if (validaFuturo && fin.getTime() > ahora.getTime() + TOLERANCIA_FUTURO_MS) {
    throw horarioInvalido('fecha_hora_fin no puede estar en el futuro');
  }

  if (fin.getTime() - inicio.getTime() > DURACION_MAXIMA_MS) {
    throw new AppError({
      code: ErrorCodes.APLICACION_DURACION_EXCESIVA,
      message: 'La aplicación no puede durar más de 24 horas',
      status: 422,
    });
  }

  return { inicio, fin };
}

/** Duración en segundos enteros; null si falta alguno de los extremos. */
export function duracionSegundos(
  inicio: Date | string | null | undefined,
  fin: Date | string | null | undefined,
): number | null {
  if (!inicio || !fin) return null;
  const ms = toDate(fin).getTime() - toDate(inicio).getTime();
  return Number.isNaN(ms) ? null : Math.round(ms / 1000);
}
