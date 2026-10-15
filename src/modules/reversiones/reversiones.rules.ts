// Reglas puras del modulo de reversiones: parseo del `detalle` del historial,
// reconstruccion del estado previo de una mesa y calculo de posiciones.
// Sin acceso a la base: todo lo que toca SQL vive en reversiones.service.ts.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Estado de la mesa justo antes de un trasplante. */
export interface EstadoPrevioMesa {
  estado: 'activa' | 'en_cosecha';
  tunel_id: string;
  fecha_ultimo_trasplante: string | null;
}

export interface TrasplanteDetalle {
  tunel_id: string | null;
  posicion_actual: number | null;
  bandeja_ids: string[];
  /** null en los trasplantes anteriores a esta funcionalidad. */
  estado_previo: EstadoPrevioMesa | null;
}

export function parseEstadoPrevio(v: unknown): EstadoPrevioMesa | null {
  const r = asRecord(v);
  if (!r) return null;
  if (r.estado !== 'activa' && r.estado !== 'en_cosecha') return null;
  if (!isUuid(r.tunel_id)) return null;
  // Una mesa trasplantable nunca tiene posicion: si el registro dice otra
  // cosa, no lo usamos para restaurar.
  if (r.posicion_actual !== null && r.posicion_actual !== undefined)
    return null;
  const fecha = r.fecha_ultimo_trasplante;
  if (fecha !== null && fecha !== undefined && typeof fecha !== 'string') {
    return null;
  }
  return {
    estado: r.estado,
    tunel_id: r.tunel_id,
    fecha_ultimo_trasplante: typeof fecha === 'string' ? fecha : null,
  };
}

export function parseTrasplanteDetalle(detalle: unknown): TrasplanteDetalle {
  const r = asRecord(detalle);
  const ids = Array.isArray(r?.bandeja_ids) ? r.bandeja_ids : [];
  const bandeja_ids = ids.every(isUuid) ? ids : [];
  return {
    tunel_id: isUuid(r?.tunel_id) ? r.tunel_id : null,
    posicion_actual:
      typeof r?.posicion_actual === 'number' ? r.posicion_actual : null,
    bandeja_ids: ids.length === bandeja_ids.length ? bandeja_ids : [],
    estado_previo: parseEstadoPrevio(r?.estado_previo),
  };
}

export function parseCosechaDetalle(detalle: unknown): {
  cosecha_id: string | null;
} {
  const r = asRecord(detalle);
  return { cosecha_id: isUuid(r?.cosecha_id) ? r.cosecha_id : null };
}

export type EstadoPrevioResolucion =
  | { ok: true; estado: EstadoPrevioMesa; origen: 'registrado' | 'inferido' }
  | { ok: false; motivo: string };

/**
 * Decide a que estado vuelve la mesa al deshacer un trasplante.
 *
 * - Trasplantes nuevos: el estado quedo grabado en el `detalle`.
 * - Trasplantes viejos (sin `estado_previo`): solo se infiere cuando el evento
 *   anterior de la mesa es una cosecha, que es el caso normal (la mesa llega al
 *   trasplante en `en_cosecha`). Cualquier otro caso es ambiguo y se rechaza:
 *   adivinar el estado de una mesa es peor que pedir un analisis manual.
 */
export function resolverEstadoPrevio(input: {
  registrado: EstadoPrevioMesa | null;
  eventoPrevioTipo: string | null;
  cosechaPreviaTunelId: string | null;
  fechaCicloAnterior: string | null;
}): EstadoPrevioResolucion {
  if (input.registrado) {
    return { ok: true, estado: input.registrado, origen: 'registrado' };
  }
  if (input.eventoPrevioTipo !== 'cosecha') {
    return {
      ok: false,
      motivo:
        'El trasplante es anterior al registro del estado previo y el evento que lo precede no es una cosecha: no se puede saber en que estado estaba la mesa',
    };
  }
  if (!input.cosechaPreviaTunelId) {
    return {
      ok: false,
      motivo: 'No se encontro la cosecha que precede al trasplante',
    };
  }
  if (!input.fechaCicloAnterior) {
    return {
      ok: false,
      motivo:
        'No se pudo recuperar la fecha del trasplante anterior de la mesa (no tiene bandejas de un ciclo previo)',
    };
  }
  return {
    ok: true,
    origen: 'inferido',
    estado: {
      estado: 'en_cosecha',
      tunel_id: input.cosechaPreviaTunelId,
      fecha_ultimo_trasplante: input.fechaCicloAnterior,
    },
  };
}

/** mesa_id -> posicion, solo de las mesas posicionadas de un tunel. */
export type Posiciones = ReadonlyMap<string, number>;

export function ultimaPosicion(posiciones: Posiciones): number {
  let max = 0;
  for (const p of posiciones.values()) if (p > max) max = p;
  return max;
}

/** La mesa sale de la fila; el resto queda donde estaba. */
export function posicionesTrasQuitar(
  antes: Posiciones,
  mesaId: string,
): Map<string, number> {
  const out = new Map(antes);
  out.delete(mesaId);
  return out;
}

/** La mesa entra en `posicion` y todas las que estaban en esa o mas atras suben 1. */
export function posicionesTrasReinsertar(
  antes: Posiciones,
  mesaId: string,
  posicion: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, p] of antes) {
    if (id === mesaId) continue;
    out.set(id, p >= posicion ? p + 1 : p);
  }
  out.set(mesaId, posicion);
  return out;
}

/** Ids cuyo valor difiere entre dos mapas (incluye altas y bajas). */
export function diferencias(
  esperado: Posiciones,
  actual: Posiciones,
): string[] {
  const ids = new Set([...esperado.keys(), ...actual.keys()]);
  return [...ids].filter((id) => esperado.get(id) !== actual.get(id));
}

/** Cuantas mesas (sin contar la revertida) cambiaron de posicion. */
export function contarDesplazadas(
  antes: Posiciones,
  despues: Posiciones,
  mesaId: string,
): number {
  let n = 0;
  for (const [id, p] of despues) {
    if (id === mesaId) continue;
    if (antes.get(id) !== p) n++;
  }
  return n;
}
