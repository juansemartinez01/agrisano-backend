# Handoff frontend — `proveedor_semilla_id` pasa a ser opcional

**Fecha**: 2026-08-20 | **Alcance**: `POST /lotes` con `tipo: "semilla"`

---

## 1. TL;DR

`proveedor_semilla_id` **dejó de ser obligatorio** al crear un lote de semilla. Antes el backend
respondía `400` si no venía; ahora crea el lote con `proveedor_semilla_id: null`.

Es un cambio **no rompedor**: seguir mandando el campo funciona exactamente igual que antes.
El front solo necesita sacarle el `required` al input.

### Por qué

No siempre se conoce el semillero al momento de cargar el lote — exigirlo obligaba a inventar un
proveedor o a no cargar el lote.

---

## 2. Qué cambió exactamente

| | Antes | Ahora |
|---|---|---|
| Omitir el campo en `tipo=semilla` | `400 BAD_REQUEST` | `201` con `proveedor_semilla_id: null` |
| Mandar un uuid válido | `201` | `201` (sin cambios) |
| Mandar un uuid inexistente | `404 PROVEEDOR_NOT_FOUND` | `404 PROVEEDOR_NOT_FOUND` (sin cambios) |
| Mandarlo en `sustrato` / `vermiculita` | `422 LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` | igual (sin cambios) |

**Nada más cambió.** `producto_id` y `variedad_id` siguen siendo obligatorios en semilla, y la
regla de que `variedad_id` debe pertenecer a `producto_id` sigue vigente.

No hubo migración: la columna ya era nullable y la FK no cambió.

---

## 3. Body mínimo de un lote de semilla

```json
{
  "tipo": "semilla",
  "numero_lote": "SEM-2026-014",
  "proveedor_id": "3f2a1b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c",
  "producto_id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "variedad_id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"
}
```

Campos opcionales que se pueden sumar: `proveedor_semilla_id`, `establecimiento_id`, `marca_id`,
`batch`, `observaciones`.

---

## 4. Impacto en las superficies de lectura

`proveedor_semilla_id` **ya podía venir `null`** en las respuestas antes de este cambio — los lotes
de sustrato y vermiculita siempre lo tuvieron así, y los tipos TS del front ya lo declaran
`string | null`. Lo nuevo es que ahora también puede ser `null` en un lote de **semilla**.

Si en algún listado se resuelve el nombre del semillero, hay que contemplar el caso vacío:

```ts
const semillero = lote.proveedor_semilla_id
  ? proveedores.get(lote.proveedor_semilla_id)?.nombre ?? '—'
  : '—';
```

---

## 5. Checklist

- [ ] Sacar el `required` del input `proveedor_semilla_id` en el form de lote de semilla
- [ ] Quitar la validación de front que bloquea el submit sin ese campo
- [ ] Verificar que el listado de lotes de semilla no rompa con el semillero en `null`
- [ ] Al editar un lote existente, seguir sin mandar `tipo` (sigue siendo inmutable, `400 LOTE_TIPO_IMMUTABLE`)

---

## 6. Verificación en dev

```bash
curl -X POST "$BASE/lotes" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT" -H "Content-Type: application/json" -d '{"tipo":"semilla","numero_lote":"QA-SEM-OPT-001","proveedor_id":"'"$PROVEEDOR"'","producto_id":"'"$PRODUCTO"'","variedad_id":"'"$VARIEDAD"'"}'
```

Debe devolver `201` y `data.proveedor_semilla_id === null`.
