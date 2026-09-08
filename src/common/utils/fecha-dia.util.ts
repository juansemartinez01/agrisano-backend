/**
 * Manejo de fechas "día calendario" (YYYY-MM-DD) que el usuario informa y el
 * sistema persiste en columnas timestamptz.
 *
 * Nació privado en siembra.service.ts para fecha_entrada_nursery. El descarte
 * de bandejas necesita exactamente las mismas tres piezas, y una segunda copia
 * de la lógica del ancla de mediodía es la forma más barata de que las dos se
 * separen con el tiempo.
 *
 * Acá viven sólo las mecánicas. Cada dominio conserva sus propias comparaciones
 * y su propio código de error: lo que es "demasiado viejo" para una entrada a
 * nursery no es lo mismo que para un descarte.
 */

/** Día actual en formato 'YYYY-MM-DD' (UTC). */
export function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Indica si la fecha existe realmente en el calendario.
 *
 * El formato ya lo validó el DTO; esto descarta el día inexistente. Ojo: JS
 * hace roll-over silencioso ('2026-02-31' -> '2026-03-03'), así que no alcanza
 * con isNaN: hay que comparar el round-trip.
 */
export function esFechaDiaValida(fecha: string): boolean {
  const parsed = new Date(`${fecha}T12:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().split('T')[0] === fecha
  );
}

/**
 * Instante a persistir para un día calendario informado por el usuario, o
 * `null` cuando corresponde usar el now() de la base.
 *
 * - Sin fecha informada, o fecha == hoy: null (now()). Usar el ancla de
 *   mediodía para "hoy" guardaría un instante futuro si el registro ocurre
 *   antes de las 12:00 UTC.
 * - Fecha pasada: mediodía UTC de ese día, que preserva el día calendario en
 *   cualquier huso entre UTC-11 y UTC+11 (el proyecto no maneja zonas horarias).
 *
 * El null es deliberado y no un "no sé": deja que cada llamador decida cómo
 * expresar now(), que no es lo mismo en un save() de TypeORM que en un
 * parámetro de SQL crudo.
 */
export function resolveFechaDia(fecha: string | undefined): Date | null {
  if (!fecha || fecha === hoyISO()) {
    return null;
  }
  return new Date(`${fecha}T12:00:00.000Z`);
}
