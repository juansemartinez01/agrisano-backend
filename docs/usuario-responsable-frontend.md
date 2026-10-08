# Usuario responsable — Guia para Frontend

## 1. Que cambio y por que

Todos los modulos que registran una accion de un operario (sembrar, trasplantar, aplicar quimicos, cosechar, empacar) ya guardaban `usuario_id`, pero el frontend tenia que resolver el nombre/email de ese usuario por su cuenta contra otro endpoint (o no lo mostraba).

A partir de ahora, los endpoints de lectura devuelven ademas un objeto `usuario` ya resuelto, con esta forma fija en todos los modulos:

```ts
type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
} | null;
```

`usuario_id` se sigue devolviendo igual que antes (no se rompio nada existente). `usuario` es un campo **nuevo y aditivo**.

### De donde sale el dato (snapshot + join en vivo)

Cada tabla auditada (`siembras`, `cosechas`, `lotes_packing`, `historial_mesa`, `aplicaciones_quimicas`, `mesa_bandeja`) guarda, ademas de `usuario_id`, una foto del usuario tomada **en el momento exacto de la creacion del registro**:

- `usuario_email_snapshot`
- `usuario_nombre_snapshot`
- `usuario_apellido_snapshot`

Estas 3 columnas viajan crudas en cualquier respuesta que devuelva la entidad completa (inclusive las respuestas de los `POST` de creacion), pero **el frontend no deberia leerlas directamente**: son un detalle interno de auditoria. Usa siempre el campo `usuario` ya armado cuando este presente.

Regla de resolucion (interna, para contexto): `email = snapshot.email ?? join_en_vivo.email ?? null`. Si el usuario borro su cuenta o cambio nombre despues, un registro viejo sigue mostrando el nombre que tenia **en ese momento** (auditoria historica correcta), no el nombre actual. Si el registro es de antes de que existiera esta funcionalidad (no tiene snapshot) y el usuario referenciado todavia existe, se resuelve con un join en vivo contra `users`. `usuario` solo es `null` cuando no se puede recuperar ningun email de ninguna de las dos fuentes (caso raro: usuario borrado fisicamente de una fila anterior a este feature).

`nombre`/`apellido` pueden ser `null` de forma independiente del `email` (usuarios creados antes de que existieran esas columnas en `users`). `email` es la unica garantia: si `usuario !== null`, `usuario.email` siempre es un string.

### Importante: no todos los endpoints devuelven el objeto `usuario`

Los endpoints de **listado y detalle (`GET`)** siempre lo incluyen. Algunos endpoints de **creacion (`POST`)** devuelven la entidad recien creada "cruda" (sin pasar por el enriquecimiento), por lo tanto **no** traen el objeto `usuario` anidado — solo `usuario_id` y las 3 columnas snapshot planas. Tabla completa en la seccion 2.

Si necesitas mostrar el nombre del responsable inmediatamente despues de crear un registro y ese endpoint no trae `usuario`, tenes dos opciones:
1. Armarlo vos mismo con las columnas planas (`usuario_email_snapshot`, etc.) — son 100% confiables justo despues de crear, porque en ese instante snapshot y dato real son lo mismo.
2. Volver a pedir el recurso por su endpoint de detalle (`GET .../:id`), que si trae `usuario`.

## 2. Tabla resumen — que endpoint trae que

| Endpoint | Metodo | Trae `usuario` anidado | Notas |
| --- | --- | --- | --- |
| `/siembras` | POST | Si | Devuelve la siembra vía el mismo camino que el detalle |
| `/siembras` | GET | Si | |
| `/siembras/:id` | GET | Si | |
| `/siembras/:id/ingresar-nursery` | POST | Si | |
| `/bandejas` | GET | No aplica | La bandeja no tiene `usuario_id` propio (ver seccion 4) |
| `/bandejas/:id` | GET | No aplica | idem |
| `/aplicaciones-quimicas` | POST | **No** | Solo `usuario_id` + columnas snapshot planas |
| `/aplicaciones-quimicas` | GET | Si | |
| `/aplicaciones-quimicas/:id` | GET | Si | |
| `/mesas/:mesa_id/aplicaciones` | GET | Si | |
| `/bandejas/:bandeja_id/aplicaciones` | GET | Si | |
| `/cosecha` | POST | **No** | Solo `usuario_id` + columnas snapshot planas |
| `/cosecha` | GET | Si | |
| `/cosecha/:id` | GET | Si | |
| `/mesas/:mesa_id/cosechas` | GET | Si | |
| `/packing` | POST | Si | |
| `/packing` | GET | Si | |
| `/packing/:id` | GET | Si | |
| `/cosechas/:cosecha_id/packing` | GET | Si | |
| `/trasplante` | POST | No aplica | La respuesta no devuelve entidades, solo ids resumen |
| `/mesas/:mesa_id/trasplantes` | GET | Si | |
| `/mesas/:id/historial` | GET | Si | |
| `/trazabilidad/cosecha/:cosecha_id` | GET | Si (varios niveles) | `cosecha.usuario`, `packing.usuario`, `bandejas_ciclo[].siembra.usuario`, `aplicaciones_invernadero[].usuario`, `aplicaciones_nursery[].usuario` |
| `/trazabilidad/mesa/:mesa_id` | GET | Si (varios niveles) | `cosechas[].usuario`, `cosechas[].packing.usuario` |

## 3. Formato general (sin cambios)

Todas las respuestas exitosas mantienen el sobre habitual:

```json
{ "ok": true, "data": { } }
```

o paginado:

```json
{ "ok": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 100 } }
```

Headers requeridos en todos los endpoints de este documento:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Errores: mismo formato global ya documentado en los demas `docs/*-frontend.md` (`ok:false`, `error.code`, `error.message`). Ningun endpoint de esta lista agrego codigos de error nuevos.

## 4. Siembras y bandejas

### 4.1. `GET /siembras`

Roles: cualquier usuario autenticado.

Query params: `page`, `limit`, `establecimiento_id` (UUID), `fecha_desde`/`fecha_hasta` (ISO date), `sortBy` (`fecha` o `created_at`), `sortOrder` (`ASC`/`DESC`, default `DESC`).

```http
GET /siembras?page=1&limit=20&establecimiento_id=e1a2b3c4-...&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "76f3972e-9b84-4b1e-94cc-fedfd283cdea",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "e1a2b3c4-1111-4a2b-9c3d-4e5f6a7b8c9d",
      "fecha": "2026-06-01",
      "observaciones": "Siembra lote A",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "usuario_email_snapshot": "operario1@agrisano.com",
      "usuario_nombre_snapshot": "Juan",
      "usuario_apellido_snapshot": "Perez",
      "created_at": "2026-06-01T09:00:00.000Z",
      "updated_at": "2026-06-01T09:00:00.000Z",
      "usuario": {
        "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "email": "operario1@agrisano.com",
        "nombre": "Juan",
        "apellido": "Perez"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Nota: esta lista **no** incluye `bandejas` (eso solo viene en el detalle).

### 4.2. `GET /siembras/:id`

Roles: cualquier usuario autenticado.

```http
GET /siembras/76f3972e-9b84-4b1e-94cc-fedfd283cdea
```

Respuesta `200`: mismos campos que el listado, mas `bandejas[]` (cada bandeja con `lote_semilla`/`lote_sustrato` resueltos, sin `usuario` propio — ver 4.5):

```json
{
  "ok": true,
  "data": {
    "id": "76f3972e-9b84-4b1e-94cc-fedfd283cdea",
    "establecimiento_id": "e1a2b3c4-1111-4a2b-9c3d-4e5f6a7b8c9d",
    "fecha": "2026-06-01",
    "observaciones": "Siembra lote A",
    "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
    "usuario": {
      "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "email": "operario1@agrisano.com",
      "nombre": "Juan",
      "apellido": "Perez"
    },
    "bandejas": [
      {
        "id": "b1c2d3e4-...",
        "siembra_id": "76f3972e-9b84-4b1e-94cc-fedfd283cdea",
        "lote_semilla_id": "l1...",
        "lote_sustrato_id": "l2...",
        "estado": "en_nursery",
        "codigo": "randomuuid-...",
        "establecimiento_id": "e1a2b3c4-...",
        "carencia_hasta": null,
        "lote_semilla": { "id": "l1...", "numero_lote": "SEM-001", "tipo": "semilla" },
        "lote_sustrato": { "id": "l2...", "numero_lote": "SUS-001", "tipo": "sustrato" }
      }
    ]
  }
}
```

Errores: `404 SIEMBRA_NOT_FOUND`.

### 4.3. `POST /siembras`

Roles: `operario`, `supervisor`, `admin_global`.

Body y reglas de negocio: sin cambios (ver `docs/siembra-frontend.md`). La respuesta `201` **si** trae `usuario` porque internamente reutiliza el mismo camino que el detalle:

```json
{
  "ok": true,
  "data": {
    "id": "76f3972e-...",
    "...": "...",
    "usuario_id": "a7b9f76c-...",
    "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
    "bandejas": [ ]
  }
}
```

### 4.4. `POST /siembras/:id/ingresar-nursery`

Roles: `operario`, `supervisor`, `admin_global`. Sin body. Respuesta `200`: misma forma que el detalle (4.2), con `usuario` incluido.

### 4.5. `GET /bandejas` y `GET /bandejas/:id`

Roles: cualquier usuario autenticado. Query params de `GET /bandejas`: `page`, `limit`, `establecimiento_id`, `siembra_id`, `lote_semilla_id`, `estado` (default `en_nursery` si no se manda), `sortBy` (`fecha_entrada_nursery`/`created_at`), `sortOrder`.

**La `Bandeja` no tiene columna `usuario_id` propia** — no hay "usuario responsable de la bandeja" como concepto separado del usuario que hizo la siembra. Por eso estos dos endpoints **no** ganaron un campo `usuario`; siguen devolviendo exactamente lo mismo que antes:

```json
{
  "ok": true,
  "data": {
    "id": "b1c2d3e4-...",
    "siembra_id": "76f3972e-...",
    "lote_semilla_id": "l1...",
    "lote_sustrato_id": "l2...",
    "estado": "en_nursery",
    "fecha_entrada_nursery": "2026-06-05T08:00:00.000Z",
    "fecha_trasplante": null,
    "mesa_id": null,
    "codigo": "3f2e1d0c-...",
    "establecimiento_id": "e1a2b3c4-...",
    "carencia_hasta": null,
    "created_at": "2026-06-01T09:00:00.000Z",
    "updated_at": "2026-06-05T08:00:00.000Z"
  }
}
```

Si necesitas saber quien sembro una bandeja, resolvelo via `GET /siembras/:siembra_id` (campo `usuario`) usando el `siembra_id` de la bandeja.

## 5. Aplicaciones quimicas

Roles y reglas de negocio generales: sin cambios (ver `docs/aplicaciones-quimicas-frontend.md`). Todos los `GET` de este modulo agregan `usuario` al nivel de la aplicacion.

### 5.1. `GET /aplicaciones-quimicas` (listado)

Query params: `page`, `limit`, `establecimiento_id`, `contexto` (`nursery`/`greenhouse`), `quimico_id`, `fecha_desde`/`fecha_hasta` (ISO 8601 con hora), `sortBy` (`fecha_hora`/`created_at`), `sortOrder`.

```json
{
  "ok": true,
  "data": [
    {
      "id": "289a11dc-cc0f-42bd-b79f-159f633ea818",
      "establecimiento_id": "e1a2b3c4-...",
      "contexto": "greenhouse",
      "observaciones": null,
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "fecha_hora": "2026-06-10T10:00:00.000Z",
      "lote_quimico_id": "lq1...",
      "dosis": "5.000000",
      "dosis_unidad": "ml_por_litro",
      "batch": "LOTE-Q-01",
      "withholding_period_dias": 7,
      "operation_group_id": "9f8e7d6c-...",
      "target_count": 3,
      "target_summary": {
        "tunnels": [ { "id": "t1...", "nombre": "Tunel 1", "table_count": 3 } ],
        "seedings": []
      },
      "chemical_lines": [
        {
          "lote_quimico_id": "lq1...",
          "chemical_id": "q1...",
          "chemical_name": "Fungicida X",
          "lot_name": "LOTE-Q-01",
          "quantity": 15,
          "unit": "litros",
          "dose": 5,
          "dose_unit": "ml_por_litro",
          "withholding_period_days": 7,
          "brand": { "id": "m1...", "nombre": "MarcaX" },
          "supplier": { "id": "p1...", "nombre": "ProveedorY" }
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

`usuario` es el unico campo nuevo de esta guia en el listado; `target_count`, `target_summary` y `chemical_lines` ya existian de un enriquecimiento anterior (no son parte de este cambio, se muestran solo para dar el shape completo).

### 5.2. `GET /aplicaciones-quimicas/:id` (detalle)

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "289a11dc-...",
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "...": "resto de columnas de AplicacionQuimica"
    },
    "detalles": [ { "id": "d1...", "aplicacion_id": "289a11dc-...", "lote_quimico_id": "lq1...", "cantidad": "15.000", "unidad_medida": "litros" } ],
    "mesa_ids": ["m1...", "m2...", "m3..."],
    "targets": {
      "context": "greenhouse",
      "total": 3,
      "tunnels": [ { "id": "t1...", "nombre": "Tunel 1", "tables": [ { "id": "m1...", "nombre": "Mesa 1", "posicion_actual": 1, "estado": "activa" } ] } ]
    }
  }
}
```

Para `contexto: "nursery"` la forma es igual pero con `bandeja_ids` en vez de `mesa_ids`, y `targets.context = "nursery"` con `seedings[]` en vez de `tunnels[]` (sin cambios respecto a antes de este trabajo; `aplicacion.usuario` es lo unico agregado).

Errores: `404 APLICACION_NOT_FOUND`.

### 5.3. `POST /aplicaciones-quimicas`

Roles: `operario`, `supervisor`, `admin_global`. Body y reglas de negocio: sin cambios.

**La respuesta `201` NO incluye `usuario` anidado.** `result.aplicacion` es la entidad recien creada tal cual quedo en la base, es decir trae `usuario_id` + las 3 columnas planas `usuario_email_snapshot`/`usuario_nombre_snapshot`/`usuario_apellido_snapshot`, pero no el objeto `usuario`:

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "289a11dc-...",
      "usuario_id": "a7b9f76c-...",
      "usuario_email_snapshot": "operario1@agrisano.com",
      "usuario_nombre_snapshot": "Juan",
      "usuario_apellido_snapshot": "Perez",
      "...": "resto de columnas"
    },
    "detalles": [ ],
    "afectados": { "mesa_ids": ["m1...", "m2...", "m3..."] }
  }
}
```

Si necesitas mostrar el nombre del responsable justo despues de crear, usa las 3 columnas snapshot de arriba, o volve a pedir `GET /aplicaciones-quimicas/:id`.

### 5.4. `GET /mesas/:mesa_id/aplicaciones` y `GET /bandejas/:bandeja_id/aplicaciones`

Roles: cualquier usuario autenticado. Query params: los mismos de 5.1 salvo `establecimiento_id`/`contexto`/`quimico_id` (no aplican aca), mas `page`/`limit`/`sortOrder` (ordena siempre por `fecha_hora`, default `DESC`).

Devuelven la lista de aplicaciones que afectaron esa mesa/bandeja, con `usuario` resuelto igual que en 5.1 pero **sin** `target_count`/`target_summary`/`chemical_lines` (son la entidad `AplicacionQuimica` simple + `usuario`):

```json
{
  "ok": true,
  "data": [
    {
      "id": "289a11dc-...",
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "contexto": "greenhouse",
      "fecha_hora": "2026-06-10T10:00:00.000Z",
      "...": "resto de columnas"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Errores: `404 MESA_NOT_FOUND` / `404 BANDEJA_NOT_FOUND` segun corresponda.

## 6. Cosecha

Reglas de negocio: sin cambios (ver `docs/cosecha-frontend.md`).

### 6.1. `POST /cosecha`

Roles: `operario`, `supervisor`, `admin_global`.

**La respuesta `201` NO incluye `usuario` anidado** (mismo caso que aplicaciones quimicas): `data.cosecha` es la entidad cruda, con `usuario_id` + columnas snapshot planas, sin objeto `usuario`.

```json
{
  "ok": true,
  "data": {
    "cosecha": {
      "id": "6df2da31-...",
      "mesa_id": "f50cf9c8-...",
      "tunel_id": "9e314fed-...",
      "producto_id": "c1a2b3c4-...",
      "variedad_id": "d2b3c4d5-...",
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-...",
      "usuario_email_snapshot": "operario1@agrisano.com",
      "usuario_nombre_snapshot": "Juan",
      "usuario_apellido_snapshot": "Perez",
      "observaciones": null,
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "mesa_id": "f50cf9c8-...",
    "tunel_id": "9e314fed-...",
    "posicion_recalculada": true
  }
}
```

### 6.2. `GET /cosecha`, `GET /cosecha/:id`, `GET /mesas/:mesa_id/cosechas`

Query params y roles: sin cambios (ver `docs/cosecha-frontend.md` seccion 10-11). Los tres agregan `usuario`:

```json
{
  "ok": true,
  "data": {
    "id": "6df2da31-...",
    "mesa_id": "f50cf9c8-...",
    "tunel_id": "9e314fed-...",
    "producto_id": "c1a2b3c4-...",
    "variedad_id": "d2b3c4d5-...",
    "posicion_al_momento": 1,
    "fecha_hora": "2026-06-09T12:00:00.000Z",
    "peso_kg": "12.500",
    "usuario_id": "a7b9f76c-...",
    "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
    "observaciones": null,
    "created_at": "2026-06-09T12:00:00.000Z",
    "updated_at": "2026-06-09T12:00:00.000Z"
  }
}
```

El listado (`GET /cosecha`, `GET /mesas/:mesa_id/cosechas`) devuelve un array de este mismo objeto dentro de `data`, con `meta` de paginacion.

Errores: `404 COSECHA_NOT_FOUND` / `404 MESA_NOT_FOUND`.

## 7. Packing

Reglas de negocio: sin cambios (ver `docs/packing-frontend.md`).

### 7.1. `POST /packing`

Roles: `operario`, `supervisor`, `admin_global`. A diferencia de cosecha/aplicaciones, packing **si** arma el `usuario` en la respuesta de creacion:

```json
{
  "ok": true,
  "data": {
    "lote_packing": {
      "id": "3d116996-...",
      "cosecha_id": "6df2da31-...",
      "fecha_hora": "2026-07-20T14:00:00.000Z",
      "peso_bruto_kg": "10.000",
      "usuario_id": "a7b9f76c-...",
      "usuario_email_snapshot": "operario1@agrisano.com",
      "usuario_nombre_snapshot": "Juan",
      "usuario_apellido_snapshot": "Perez",
      "observaciones": null,
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" }
    },
    "categorias": [
      { "id": "cat1...", "lote_packing_id": "3d116996-...", "categoria": "primera", "peso_kg": "8.000", "cantidad_cajas": 4, "peso_neto_por_caja": "2.000" }
    ]
  }
}
```

Errores: `404 COSECHA_NOT_FOUND` (la cosecha referenciada no existe), `422 PACKING_CATEGORIA_DUPLICADA`, `409 PACKING_YA_REGISTRADO` (ya existe packing para esa cosecha — es 1:1).

### 7.2. `GET /packing`, `GET /packing/:id`, `GET /cosechas/:cosecha_id/packing`

Query params de `GET /packing`: `page`, `limit`, `cosecha_id` (UUID), `sortOrder` (ordena por `fecha_hora`, default `DESC`).

Misma forma que 7.1 (`{ lote_packing, categorias }` en detalle; el listado es un array de `lote_packing` sin `categorias` — ver el service: `listPacking` devuelve solo los campos de `LotePacking` + `usuario`, no las categorias por item).

```json
{
  "ok": true,
  "data": [
    {
      "id": "3d116996-...",
      "cosecha_id": "6df2da31-...",
      "fecha_hora": "2026-07-20T14:00:00.000Z",
      "peso_bruto_kg": "10.000",
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "observaciones": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Errores: `404 PACKING_NOT_FOUND` en detalle y en `GET /cosechas/:cosecha_id/packing` (si la cosecha no tiene packing todavia).

## 8. Trasplante

Reglas de negocio: sin cambios (ver `docs/trasplante-frontend.md`).

### 8.1. `POST /trasplante`

Roles: `operario`, `supervisor`, `admin_global`.

Body:

```json
{
  "mesa_id": "f50cf9c8-...",
  "tunel_id": "9e314fed-...",
  "bandeja_ids": ["b1...", "b2..."],
  "observaciones": "Trasplante lote A"
}
```

La respuesta `200` **no cambio y no incluye `usuario`** porque nunca devolvio entidades, solo un resumen de la operacion:

```json
{
  "ok": true,
  "data": {
    "mesa_id": "f50cf9c8-...",
    "tunel_id": "9e314fed-...",
    "posicion_actual": 3,
    "bandejas_trasplantadas": ["b1...", "b2..."]
  }
}
```

Internamente cada fila creada en `mesa_bandeja` si guarda `usuario_id` + snapshot (nuevo desde este trabajo — antes ni siquiera existia esa columna), pero para verla hay que consultar el listado (8.2).

### 8.2. `GET /mesas/:mesa_id/trasplantes`

Roles: cualquier usuario autenticado. Query params: `page`, `limit`, `sortBy` (ignorado por el service, ordena siempre por `fecha_trasplante`), `sortOrder`.

```json
{
  "ok": true,
  "data": [
    {
      "mesa_id": "f50cf9c8-...",
      "bandeja_id": "b1...",
      "fecha_trasplante": "2026-06-15T09:00:00.000Z",
      "usuario_id": "a7b9f76c-...",
      "usuario_email_snapshot": "operario1@agrisano.com",
      "usuario_nombre_snapshot": "Juan",
      "usuario_apellido_snapshot": "Perez",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Nota historica: filas de `mesa_bandeja` creadas **antes** de este cambio no tienen `usuario_id` (la columna no existia). En esas filas `usuario_id` y `usuario` vienen ambos `null` — es esperable, no es un bug.

Errores: `404 MESA_NOT_FOUND`.

## 9. Historial de mesa

### 9.1. `GET /mesas/:id/historial`

Roles: cualquier usuario autenticado. Query params: `page`, `limit`, `sortBy` (`fecha_hora`/`created_at`), `sortOrder` (default `DESC`).

```http
GET /mesas/f50cf9c8-4b65-4ba5-8f1e-5546109065fb/historial?page=1&limit=20
```

```json
{
  "ok": true,
  "data": [
    {
      "id": "h1...",
      "mesa_id": "f50cf9c8-...",
      "tipo_evento": "trasplante",
      "fecha_hora": "2026-06-15T09:00:00.000Z",
      "detalle": { "tunel_id": "9e314fed-...", "posicion_actual": 3, "bandeja_ids": ["b1...", "b2..."], "observaciones": null },
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "created_at": "2026-06-15T09:00:00.000Z",
      "updated_at": "2026-06-15T09:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

`tipo_evento` puede ser `trasplante`, `cosecha`, `cambio_posicion`, `aplicacion_quimica`, `reactivacion`, `baja` o `en_carencia`; el `detalle` varía segun el tipo (sin cambios respecto a antes). Lo unico nuevo en este endpoint es `usuario`.

Errores: `404 MESA_NOT_FOUND`.

## 10. Trazabilidad

Estos dos endpoints son los mas afectados: agregan `usuario` en varios niveles distintos, y ademas se corrigio un bug (ver seccion 10.3).

### 10.1. `GET /trazabilidad/cosecha/:cosecha_id`

Roles: `operario`, `supervisor`, `admin_global`.

```http
GET /trazabilidad/cosecha/6df2da31-3cbf-435b-ba6f-555128a87253
```

Respuesta `200` (recortada, mostrando solo donde aparece `usuario`):

```json
{
  "ok": true,
  "data": {
    "cosecha": {
      "id": "6df2da31-...",
      "mesa_id": "f50cf9c8-...",
      "producto_id": "c1a2b3c4-...",
      "producto": { "id": "c1a2b3c4-...", "nombre": "Lechuga" },
      "variedad_id": "d2b3c4d5-...",
      "variedad": { "id": "d2b3c4d5-...", "nombre": "Criolla" },
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "peso_kg": "12.500",
      "...": "resto de columnas de Cosecha"
    },
    "mesa": {
      "id": "f50cf9c8-...",
      "codigo_qr": "QR-001",
      "nombre": "Mesa 1",
      "estado": "en_cosecha",
      "tunel_id": "9e314fed-...",
      "tunel": { "nombre": "Tunel 1" },
      "establecimiento_id": "e1a2b3c4-...",
      "establecimiento": { "id": "e1a2b3c4-...", "nombre": "Establecimiento Norte" },
      "carencia_hasta": null
    },
    "packing": {
      "id": "3d116996-...",
      "fecha_hora": "2026-07-20T14:00:00.000Z",
      "peso_bruto_kg": "10.000",
      "usuario_id": "a7b9f76c-...",
      "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
      "observaciones": null,
      "categorias": [ { "id": "cat1...", "categoria": "primera", "peso_kg": "8.000", "cantidad_cajas": 4, "peso_neto_por_caja": "2.000" } ]
    },
    "bandejas_ciclo": [
      {
        "bandeja_id": "b1...",
        "fecha_trasplante": "2026-06-15T09:00:00.000Z",
        "siembra_id": "76f3972e-...",
        "estado": "trasplantada",
        "carencia_hasta": null,
        "siembra": {
          "id": "76f3972e-...",
          "fecha": "2026-06-01",
          "observaciones": null,
          "usuario_id": "a7b9f76c-...",
          "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
          "lote_semilla": { "id": "l1...", "numero_lote": "SEM-001", "tipo": "semilla" },
          "lote_sustrato": { "id": "l2...", "numero_lote": "SUS-001", "tipo": "sustrato" }
        }
      }
    ],
    "aplicaciones_invernadero": [
      {
        "id": "289a11dc-...",
        "usuario_id": "a7b9f76c-...",
        "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
        "fecha_hora": "2026-06-20T10:00:00.000Z",
        "lote_quimico": { "id": "lq1...", "numero_lote": "LOTE-Q-01", "quimico": { "id": "q1...", "nombre": "Fungicida X", "marca": { "id": "m1...", "nombre": "MarcaX" } }, "proveedor": { "id": "p1...", "nombre": "ProveedorY" } },
        "carencia_hasta_calculada": "2026-06-27T10:00:00.000Z",
        "detalles": [ { "id": "d1...", "lote_quimico_id": "lq1...", "cantidad": "15.000", "unidad_medida": "litros", "lote_quimico": { "id": "lq1...", "numero_lote": "LOTE-Q-01", "quimico": { "id": "q1...", "nombre": "Fungicida X", "marca": null }, "proveedor": null } } ]
      }
    ],
    "aplicaciones_nursery": [],
    "alerta_carencia_incumplida": false
  }
}
```

Puntos clave:

- `cosecha.usuario`: el responsable de la cosecha.
- `packing.usuario`: el responsable del packing de esa cosecha (`null` si todavia no se registro packing, en cuyo caso `packing` completo es `null`).
- `bandejas_ciclo[].siembra.usuario`: el responsable de la siembra original de cada bandeja del ciclo de cultivo que termino en esta cosecha. `siembra` es `null` si la bandeja no tiene siembra asociada (dato historico raro).
- `aplicaciones_invernadero[].usuario` y `aplicaciones_nursery[].usuario`: el responsable de cada aplicacion quimica aplicada durante ese ciclo (en la mesa o en las bandejas, respectivamente).

Errores: `404 COSECHA_NOT_FOUND`.

### 10.2. `GET /trazabilidad/mesa/:mesa_id`

Roles: `operario`, `supervisor`, `admin_global`.

```http
GET /trazabilidad/mesa/f50cf9c8-4b65-4ba5-8f1e-5546109065fb
```

```json
{
  "ok": true,
  "data": {
    "mesa": {
      "id": "f50cf9c8-...",
      "codigo_qr": "QR-001",
      "nombre": "Mesa 1",
      "estado": "activa",
      "tunel_id": "9e314fed-...",
      "tunel": { "nombre": "Tunel 1" },
      "establecimiento_id": "e1a2b3c4-...",
      "establecimiento": { "id": "e1a2b3c4-...", "nombre": "Establecimiento Norte" },
      "carencia_hasta": null
    },
    "cosechas": [
      {
        "cosecha_id": "6df2da31-...",
        "fecha_hora": "2026-07-20T12:00:00.000Z",
        "peso_kg": "12.500",
        "producto_id": "c1a2b3c4-...",
        "producto": { "id": "c1a2b3c4-...", "nombre": "Lechuga" },
        "variedad_id": "d2b3c4d5-...",
        "variedad": { "id": "d2b3c4d5-...", "nombre": "Criolla" },
        "usuario_id": "a7b9f76c-...",
        "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
        "observaciones": null,
        "posicion_al_momento": 1,
        "packing": {
          "peso_bruto_kg": "10.000",
          "usuario_id": "a7b9f76c-...",
          "usuario": { "id": "a7b9f76c-...", "email": "operario1@agrisano.com", "nombre": "Juan", "apellido": "Perez" },
          "categorias": [ { "id": "cat1...", "categoria": "primera", "peso_kg": "8.000", "cantidad_cajas": 4, "peso_neto_por_caja": "2.000" } ]
        }
      }
    ]
  }
}
```

Puntos clave:

- `cosechas[].usuario`: responsable de cada cosecha historica de la mesa.
- `cosechas[].packing.usuario`: responsable del packing de cada cosecha (si existe). **Este campo es nuevo de punta a punta**: antes de este trabajo, `packing` dentro de este endpoint solo traia `peso_bruto_kg` y `categorias`, sin ningun dato de usuario ni siquiera `usuario_id`. Si tu UI ya consume este endpoint y no esperaba mas campos en `packing`, no deberia romperse (es aditivo), pero ahora podes mostrar quien empaco cada cosecha directamente desde aca sin otra llamada.

Errores: `404 MESA_NOT_FOUND`.

## 11. Ejemplos con fetch

Reutiliza el cliente base de `docs/cosecha-frontend.md` seccion 14. Ejemplos especificos de esta guia:

### Mostrar "Cosechado por" en un listado

```ts
function nombreResponsable(usuario: { nombre: string | null; apellido: string | null; email: string } | null): string {
  if (!usuario) return "Desconocido";
  const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(" ");
  return nombreCompleto || usuario.email;
}

const response = await apiFetch("/cosecha?page=1&limit=20");
const filas = response.data.map((c: any) => ({
  ...c,
  responsable: nombreResponsable(c.usuario),
}));
```

### Armar el responsable justo despues de un POST que no trae `usuario`

```ts
const response = await apiFetch("/cosecha", { method: "POST", body: JSON.stringify(dto) });
const cosecha = response.data.cosecha;

// cosecha.usuario NO existe en la respuesta de POST /cosecha.
// Se arma con las columnas snapshot planas, que ya vienen resueltas:
const responsable = cosecha.usuario_email_snapshot
  ? {
      id: cosecha.usuario_id,
      email: cosecha.usuario_email_snapshot,
      nombre: cosecha.usuario_nombre_snapshot,
      apellido: cosecha.usuario_apellido_snapshot,
    }
  : null;
```

### Trazabilidad completa de una cosecha

```ts
const response = await apiFetch(`/trazabilidad/cosecha/${cosechaId}`);
const data = response.data;

console.log("Cosechado por:", nombreResponsable(data.cosecha.usuario));
console.log("Empacado por:", data.packing ? nombreResponsable(data.packing.usuario) : "Sin packing");
data.bandejas_ciclo.forEach((b: any) => {
  console.log("Bandeja", b.bandeja_id, "sembrada por:", b.siembra ? nombreResponsable(b.siembra.usuario) : "N/D");
});
```

## 12. Checklist para integracion frontend

- El tipo `UsuarioResumen` (`{id, email, nombre, apellido} | null`) se agrega como un tipo compartido en el cliente frontend, igual que en el backend.
- La UI nunca lee `usuario_email_snapshot`/`usuario_nombre_snapshot`/`usuario_apellido_snapshot` directamente salvo en los 3 endpoints `POST` que no devuelven `usuario` (`POST /cosecha`, `POST /aplicaciones-quimicas`; `POST /trasplante` ni siquiera trae esas columnas, no devuelve entidades).
- Los listados y detalles (`GET`) siempre confian en el campo `usuario` ya armado; no se vuelve a resolver `usuario_id` contra otro endpoint.
- La UI maneja `usuario === null` (cae a un texto tipo "Desconocido" o al `usuario_id` crudo), aunque en la practica solo pasa con datos historicos muy viejos.
- La UI maneja `usuario.nombre`/`usuario.apellido` en `null` (usuarios antiguos sin esos campos cargados) mostrando el `email` como fallback.
- Los trasplantes historicos (anteriores a esta funcionalidad) muestran `usuario: null` en `GET /mesas/:mesa_id/trasplantes` sin que eso se trate como error.
- En `GET /trazabilidad/mesa/:mesa_id`, la UI ya contempla que `cosechas[].packing` puede traer `usuario`/`usuario_id` ademas de `peso_bruto_kg`/`categorias` (antes no los tenia).
- Ningun `error.code` nuevo fue introducido por este trabajo; el manejo de errores existente de cada modulo no cambia.
