# Handoff frontend — lotes de vermiculita con grado

**Estado**: US1 + US2 (alta de lotes y uso en la siembra) desplegadas y verificadas en dev el 2026-08-12. US3 + US4 (trazabilidad, aplicaciones químicas y filtro de bandejas) están en la rama `020-lote-vermiculita`, pendientes de merge y deploy.
**Tipo de cambio**: ✅ **aditivo**, con **una salvedad importante** — ver la sección 3. Ningún endpoint cambia de shape para los casos existentes, pero aparece un tercer valor en un enum que el frontend probablemente esté tratando como binario.
**Referencia técnica**: `specs/020-lote-vermiculita/spec.md`, `specs/020-lote-vermiculita/data-model.md`, `specs/020-lote-vermiculita/quickstart.md`.

---

## 1. TL;DR

Existe un **tercer tipo de lote**: `vermiculita`. Recorre exactamente el mismo camino que `sustrato` (alta, edición, consumo, uso en siembra, trazabilidad), con **un campo extra propio**: `grado`, un selector de 1, 2 o 3.

1. **`tipo` ahora tiene 3 valores**: `"semilla"`, `"sustrato"`, `"vermiculita"`. ⚠️ **Este es el único punto que puede romper algo ya escrito** — ver sección 3.
2. **Campo nuevo `grado`** (`number | null`) en todo lote: obligatorio si `tipo === "vermiculita"`, prohibido en los otros dos.
3. **`POST /siembras` acepta `lote_vermiculita_id` opcional** por grupo de bandejas. No toda siembra lleva vermiculita.
4. **Tres superficies de lectura ganan campos nullable**: detalle de siembra, trazabilidad por cosecha y detalle de aplicación química.
5. **`GET /bandejas` gana el filtro `lote_vermiculita_id`**, para rastrear todas las bandejas sembradas con una partida.
6. **Código de error nuevo**: `LOTE_GRADO_NO_PERMITIDO` (422).

### Por qué

En el invernadero la vermiculita se compra por partidas, igual que el sustrato, y hay que poder trazar qué partida se usó en cada bandeja. La diferencia con el sustrato es que la vermiculita tiene un **grado** (granulometría) que cambia el comportamiento del sembrado, y ese dato tiene que quedar registrado junto al lote y visible en la trazabilidad.

---

## 2. Endpoints afectados

| Endpoint | Impacto |
|---|---|
| `POST /lotes` | Acepta `tipo: "vermiculita"` y el campo `grado`. Roles sin cambios: `supervisor`, `admin_global`. |
| `PATCH /lotes/:id` | Acepta `grado`. `tipo` sigue siendo inmutable. |
| `GET /lotes` | Gana el query param `grado`. Cada item gana la columna `grado` (`null` en semilla y sustrato). |
| `GET /lotes/:id` | Sin cambios de comportamiento. La respuesta gana `grado`. |
| `DELETE /lotes/:id` | Sin cambios de contrato, pero ahora **también** bloquea (409) si el lote de vermiculita está referenciado por bandejas. Antes ese conteo no lo miraba y un lote en uso se podía borrar. |
| `POST /siembras` | Gana `lote_vermiculita_id` **opcional** por grupo. Gana los rechazos 422 correspondientes. |
| `GET /siembras/:id` | Cada bandeja gana `lote_vermiculita_id` y el objeto `lote_vermiculita`, ambos nullable. |
| `GET /trazabilidad/cosecha/:cosecha_id` | Cada `bandejas_ciclo[]` gana `lote_vermiculita_id`; `siembra.lote_vermiculita` es nullable. |
| `GET /aplicaciones-quimicas/:id` | Cada `targets.seedings[]` gana `vermiculite_lot` (nullable). |
| `GET /bandejas` | Gana el query param `lote_vermiculita_id`. |
| `GET /trazabilidad/mesa/:mesa_id` | **Sin cambios** — no incluye linaje de lotes. |

**Nada de lo anterior obliga a tocar pantallas de lectura para que sigan funcionando**, salvo lo de la sección 3.

---

## 3. ⚠️ El punto que sí puede romper: `tipo` dejó de ser binario

Hasta ahora `tipo` solo podía ser `"semilla"` o `"sustrato"`, así que era razonable escribir:

```ts
// ❌ Ahora etiqueta la vermiculita como "Sustrato"
const label = lote.tipo === 'semilla' ? 'Semilla' : 'Sustrato';
```

```ts
// ❌ Ahora mete la vermiculita en la columna de sustrato
const columna = lote.tipo === 'semilla' ? columnaSemilla : columnaSustrato;
```

Ninguno de esos falla ni tira error: **muestran un dato equivocado en silencio**. Conviene barrer el código buscando comparaciones contra `'semilla'` / `'sustrato'` y convertirlas a un mapa exhaustivo:

```ts
const LOTE_TIPO_LABEL: Record<LoteTipo, string> = {
  semilla: 'Semilla',
  sustrato: 'Sustrato',
  vermiculita: 'Vermiculita',
};
```

Si el tipo del enum está declarado en el frontend, agregarle `'vermiculita'` hace que TypeScript marque como error todos los `Record<LoteTipo, ...>` incompletos — es la forma más barata de encontrar los lugares.

Lo mismo aplica a cualquier filtro de tipo con dos opciones fijas y a cualquier ícono/color por tipo.

---

## 4. `grado`

| | |
|---|---|
| Tipo | `number \| null` |
| Valores válidos | `1`, `2`, `3` |
| En `tipo: "vermiculita"` | **Obligatorio** al crear |
| En `tipo: "semilla"` y `"sustrato"` | **Prohibido** — mandarlo da 422 |
| Editable | Sí, vía `PATCH /lotes/:id` (solo en lotes de vermiculita) |

La base tiene un CHECK bidireccional: un lote de vermiculita **siempre** tiene grado, y un lote que no es de vermiculita **nunca** lo tiene. No hay estados intermedios posibles.

### Al crear

```jsonc
// ✅ 201
POST /lotes
{ "tipo": "vermiculita", "numero_lote": "V-001", "proveedor_id": "...", "grado": 2 }

// ❌ 400 — falta grado
{ "tipo": "vermiculita", "numero_lote": "V-001", "proveedor_id": "..." }

// ❌ 400 — grado fuera de dominio
{ "tipo": "vermiculita", "numero_lote": "V-001", "proveedor_id": "...", "grado": 4 }

// ❌ 422 LOTE_GRADO_NO_PERMITIDO
{ "tipo": "sustrato", "numero_lote": "S-001", "proveedor_id": "...", "grado": 2 }
```

El `ValidationPipe` global convierte tipos, así que `"grado": "2"` (string) se acepta y se guarda como `2`. Igual conviene mandar número.

### Al editar

```jsonc
// ✅ 200 — sobre un lote de vermiculita
PATCH /lotes/:id
{ "grado": 3 }

// ❌ 422 LOTE_GRADO_NO_PERMITIDO — sobre un lote de sustrato o semilla
{ "grado": 3 }
```

`tipo` sigue sin poder editarse (400 si viene en el body). Si hace falta cambiar de tipo, el flujo es dar de baja el lote y crear uno nuevo.

### Recomendación de UX

El grado es un **selector de 3 opciones**, no un input numérico libre. Mostrarlo solo cuando `tipo === "vermiculita"` está seleccionado, y limpiarlo si el usuario cambia el tipo antes de guardar — si queda colgado en el body con otro tipo, la respuesta es 422.

---

## 5. `GET /lotes` — filtro nuevo

| Param | Valores | Nota |
|---|---|---|
| `tipo` | `semilla` \| `sustrato` \| `vermiculita` | Ya existía, gana el tercer valor |
| `grado` | `1` \| `2` \| `3` | **Nuevo** |

```
GET /lotes?tipo=vermiculita
GET /lotes?tipo=vermiculita&grado=2
GET /lotes?tipo=vermiculita&disponible=true      # habilitado + activo
```

`grado` sin `tipo` funciona pero es redundante: como semilla y sustrato tienen `grado: null`, filtrar por grado ya devuelve solo vermiculita.

Los filtros `estado`, `activo` y `disponible` de la feature anterior aplican igual a la vermiculita — ver `docs/handoff-frontend-lote-estado-consumido.md`.

---

## 6. `POST /siembras` — `lote_vermiculita_id` opcional

El único cambio de request en toda la feature:

```jsonc
POST /siembras
{
  "establecimiento_id": "...",
  "bandejas": [
    {
      "lote_semilla_id": "...",        // obligatorio, como siempre
      "lote_sustrato_id": "...",       // obligatorio, como siempre
      "lote_vermiculita_id": "...",    // ⬅ NUEVO, opcional
      "cantidad": 24
    }
  ]
}
```

Omitirlo es un caso válido y de primera clase: **no toda siembra lleva vermiculita**. Las siembras que ya existían no se ven afectadas.

### Rechazos (todos 422)

| Código | Cuándo |
|---|---|
| `LOTE_TIPO_INCORRECTO` | El id apunta a un lote que no es de tipo `vermiculita` |
| `LOTE_ESTABLECIMIENTO_MISMATCH` | El lote está atado a otro establecimiento |
| `LOTE_CONSUMIDO` | El lote está en `estado: "consumido"` |
| `LOTE_INACTIVO` | El lote tiene `activo: false` |

Son los mismos cuatro que ya se aplicaban a semilla y sustrato.

**Orden de los errores**: la vermiculita se valida **al final** de cada grupo, después de semilla y sustrato. Si una siembra tiene problemas en varios lotes, el error que se reporta primero es el mismo que antes de esta feature — no hay que reescribir el manejo de errores existente.

### Recomendación de UX

El selector de vermiculita conviene alimentarlo con `GET /lotes?tipo=vermiculita&disponible=true`, que ya excluye consumidos e inactivos, y mostrar el grado en la opción (`V-001 — grado 2`), porque el grado es justamente lo que hace elegir una partida sobre otra.

---

## 7. Superficies de lectura

Las tres son **aditivas y nullable**. En todos los casos hay un `..._id` (columna real, fuente de verdad para "¿hay vermiculita?") y un objeto anidado que viene `null` cuando no hay. Conviene manejar el objeto con `?? null` y decidir por el id.

### `GET /siembras/:id` — cada bandeja

```jsonc
{
  "id": "...",
  "codigo": "...",
  "lote_semilla_id": "...",
  "lote_sustrato_id": "...",
  "lote_vermiculita_id": "...",          // string | null
  "lote_semilla":     { "id": "...", "numero_lote": "S-01", "tipo": "semilla" },
  "lote_sustrato":    { "id": "...", "numero_lote": "U-01", "tipo": "sustrato" },
  "lote_vermiculita": { "id": "...", "numero_lote": "V-001", "tipo": "vermiculita", "grado": 2 }
}
```

Notar que `lote_vermiculita` es el **único** de los tres que trae `grado`.

### `GET /trazabilidad/cosecha/:cosecha_id` — cada `bandejas_ciclo[]`

```jsonc
{
  "bandeja_id": "...",
  "lote_semilla_id": "...",
  "lote_sustrato_id": "...",
  "lote_vermiculita_id": "...",          // string | null
  "siembra": {
    "lote_semilla":     { "id": "...", "numero_lote": "S-01", "tipo": "semilla" },
    "lote_sustrato":    { "id": "...", "numero_lote": "U-01", "tipo": "sustrato" },
    "lote_vermiculita": { "id": "...", "numero_lote": "V-001", "tipo": "vermiculita", "grado": 2 }
  }
}
```

`siembra.lote_vermiculita` es **nullable**, a diferencia de `lote_semilla` y `lote_sustrato` que siempre vienen. Todas las bandejas anteriores a esta feature lo traen en `null`.

### `GET /aplicaciones-quimicas/:id` — cada `targets.seedings[]`

Este archivo usa nombres en inglés:

```jsonc
{
  "seed_lot":       { "id": "...", "numero_lote": "S-01" },
  "substrate_lot":  { "id": "...", "numero_lote": "U-01" },
  "vermiculite_lot": { "id": "...", "numero_lote": "V-001", "grado": 2 }   // nullable
}
```

Igual que `seed_lot` y `substrate_lot`, **degrada a `null` si el grupo es heterogéneo**: si la aplicación toca bandejas de siembras con distinta vermiculita, el campo viene `null` en vez de elegir una arbitrariamente. Es el comportamiento que ya tienen los otros dos.

---

## 8. `GET /bandejas?lote_vermiculita_id=...`

Rastreo por partida: devuelve las bandejas sembradas con ese lote de vermiculita, en todos los establecimientos del tenant.

```
GET /bandejas?lote_vermiculita_id=<uuid>&estado=en_nursery
GET /bandejas?lote_vermiculita_id=<uuid>&estado=trasplantada
```

> 🕐 **Desactualizado.** Este aviso valia hasta la feature de descarte de bandejas.
> Hoy `estado` es opcional de verdad: sin filtro se devuelven todos los estados
> menos `descartada`. Ya no hace falta pedir estado por estado ni sumar totales.
> Ver el bloque "BREAKING: `estado` ya no tiene default `en_nursery`" en
> `docs/siembra-frontend.md`. Se deja el texto original como registro:

> ⚠️ **`GET /bandejas` filtra `estado=en_nursery` cuando no se manda `estado`.** No es
> de esta feature — es el default histórico del endpoint y le pasa igual a
> `lote_semilla_id` — pero rompe la lectura ingenua de "todas las bandejas de la
> partida": las ya trasplantadas no aparecen y el conteo sale corto sin ningún
> error. Para el alcance completo de una partida hay que recorrer los estados
> (`cooling_period`, `en_nursery`, `trasplantada`) y sumar los `meta.total`.

Sirve, por ejemplo, para acotar el alcance de un problema atribuido a una partida. El filtro combina con los que ya existían (`estado`, `establecimiento_id`, `siembra_id`, `lote_semilla_id`).

> Nota: **no existe** el filtro equivalente `lote_sustrato_id`. Faltaba desde antes de esta feature y se dejó afuera a propósito por alcance. Si hace falta, es un cambio de una línea en el backend.

---

## 9. Códigos de error

| Código | HTTP | Dónde | Cuándo |
|---|---|---|---|
| `LOTE_GRADO_NO_PERMITIDO` | 422 | `POST /lotes`, `PATCH /lotes/:id` | Se mandó `grado` en un lote que no es de vermiculita |
| `LOTE_TIPO_INCORRECTO` | 422 | `POST /siembras` | Ya existía; ahora también para `lote_vermiculita_id` |
| `LOTE_CONSUMIDO` | 422 | `POST /siembras` | Ya existía; ahora también para vermiculita |
| `LOTE_INACTIVO` | 422 | `POST /siembras` | Ya existía; ahora también para vermiculita |
| `LOTE_ESTABLECIMIENTO_MISMATCH` | 422 | `POST /siembras` | Ya existía; ahora también para vermiculita |
| `LOTE_NUMERO_DUPLICADO` | 409 | `POST /lotes`, `PATCH /lotes/:id` | Ya existía. **La numeración es independiente por tipo**: un `V-001` de vermiculita convive con un `V-001` de sustrato sin conflicto |
| `LOTE_REFERENCED_BY_BANDEJA` | 409 | `DELETE /lotes/:id` | Ya existía; ahora también se dispara para vermiculita en uso |

---

## 10. Ejemplos de llamada (TS)

```ts
// Todas las respuestas vienen envueltas; los listados suman meta.
interface Envelope<T> {
  ok: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

type LoteTipo = 'semilla' | 'sustrato' | 'vermiculita';

interface Lote {
  id: string;
  tipo: LoteTipo;
  numero_lote: string;
  grado: number | null;        // 1 | 2 | 3, solo en vermiculita
  estado: 'habilitado' | 'consumido';
  activo: boolean;
  // ...resto sin cambios
}

// Alta
await api.post<Lote>('/lotes', {
  tipo: 'vermiculita',
  numero_lote: 'V-001',
  proveedor_id: proveedorId,
  grado: 2,
});

// Opciones para el selector de la siembra.
// Ojo con el envelope: la API devuelve { ok, data, meta }, no { items }.
const { data: lotes } = await api.get<Envelope<Lote[]>>('/lotes', {
  params: { tipo: 'vermiculita', disponible: true },
});
const opciones = lotes.map((l) => ({
  value: l.id,
  label: `${l.numero_lote} — grado ${l.grado}`,
}));

// Siembra con vermiculita
await api.post('/siembras', {
  establecimiento_id: estId,
  bandejas: [
    {
      lote_semilla_id: semillaId,
      lote_sustrato_id: sustratoId,
      lote_vermiculita_id: vermiculitaId,   // omitir si no lleva
      cantidad: 24,
    },
  ],
});

// Lectura defensiva
const v = bandeja.lote_vermiculita ?? null;
const textoVermiculita = v ? `${v.numero_lote} (grado ${v.grado})` : 'Sin vermiculita';

// Rastreo por partida. Sin `estado` el backend solo devuelve las bandejas
// en_nursery: para ver la partida entera hay que pedir cada estado.
const { data: bandejas } = await api.get<Envelope<Bandeja[]>>('/bandejas', {
  params: { lote_vermiculita_id: vermiculitaId, estado: 'trasplantada' },
});
```

---

## 11. Lo que NO cambió

- El shape de los lotes de semilla y sustrato, salvo el campo aditivo `grado: null`.
- `POST /siembras` sin `lote_vermiculita_id`: idéntico al camino previo, mismos errores en el mismo orden.
- Roles y tenancy: sin cambios. `POST`/`PATCH` de lotes siguen pidiendo `supervisor` o `admin_global`; `POST /siembras` acepta también `operario`.
- `GET /trazabilidad/mesa/:mesa_id`: no incluye linaje de lotes, no se tocó.
- Cosecha, packing, trasplante, mesas, túneles, químicos, marcas: sin cambios.
- El eje `activo` / `estado` de la feature anterior: aplica a la vermiculita exactamente igual, sin reglas nuevas.

---

## 12. Checklist de implementación

- [ ] Agregar `'vermiculita'` al tipo `LoteTipo` del frontend y **compilar**: los `Record<LoteTipo, ...>` incompletos van a marcar error.
- [ ] Barrer ternarios y condicionales de dos ramas sobre `tipo` (sección 3).
- [ ] Agregar `vermiculita` a los filtros de tipo y a los selectores de la pantalla de lotes.
- [ ] Formulario de lote: mostrar el selector `grado` (1/2/3) solo con `tipo === 'vermiculita'`, obligatorio, y limpiarlo al cambiar de tipo.
- [ ] Listado de lotes: columna `grado` (vacía cuando es `null`) y filtro por grado.
- [ ] Formulario de siembra: selector opcional de vermiculita alimentado con `tipo=vermiculita&disponible=true`, mostrando el grado en la etiqueta.
- [ ] Detalle de siembra: mostrar `lote_vermiculita` con su grado, y el estado "sin vermiculita" cuando es `null`.
- [ ] Trazabilidad por cosecha: mostrar la vermiculita del ciclo; contemplar `null` en ciclos viejos.
- [ ] Detalle de aplicación química: mostrar `vermiculite_lot`, contemplando el `null` por grupo heterogéneo.
- [ ] Manejar `LOTE_GRADO_NO_PERMITIDO` en el formulario de lote.
- [ ] (Opcional) Vista de rastreo por partida con `GET /bandejas?lote_vermiculita_id=`.

---

## 13. Verificación en dev

Hecha el 2026-08-12 contra `https://agrisano-backend-production.up.railway.app`: la batería completa de `specs/020-lote-vermiculita/quickstart.md` (pasos 1 a 24 más la regresión, más auth, tenancy y forma del contrato) cerró en **181 verificaciones en verde y ningún fallo atribuible al backend**. Trece aserciones fallaron en la primera pasada por errores del propio script de prueba —una mesa que no estaba en estado válido para trasplante y el default de `estado` del listado de bandejas—; corregidas, pasaron todas.

El punto que más importaba, el **19**, quedó confirmado contra Postgres real: las cosechas anteriores a la feature siguen devolviendo sus bandejas enteras, con `lote_vermiculita: null` y `lote_semilla`/`lote_sustrato` completos. Se barrieron 11 cosechas viejas, todas 200 y sin lotes degradados.

Los dos únicos hallazgos fueron de documentación, no de código, y ya están corregidos acá: el envelope de las respuestas (sección 10) y el default `estado=en_nursery` del filtro de bandejas (sección 8).
