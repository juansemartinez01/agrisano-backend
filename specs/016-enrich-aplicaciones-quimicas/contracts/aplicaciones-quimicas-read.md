# Contract: Endpoints de lectura de Aplicaciones Químicas

Rutas, auth, filtros y paginación **sin cambios**. Todo lo nuevo es aditivo.

## GET /aplicaciones-quimicas

Query params (sin cambios): `page`, `limit` (tope 200), `sortBy` (`fecha_hora`|`created_at`), `sortOrder`, `establecimiento_id`, `contexto`, `fecha_desde`, `fecha_hasta`, `quimico_id`.

### Respuesta (item greenhouse)

```jsonc
{
  "ok": true,
  "data": [
    {
      // ── campos actuales, intactos ──
      "id": "application-uuid",
      "tenant_id": "tenant-uuid",
      "establecimiento_id": "establishment-uuid",
      "contexto": "greenhouse",
      "observaciones": "Aplicación de prueba",
      "usuario_id": "user-uuid",
      "fecha_hora": "2026-07-23T20:34:55.827Z",
      "lote_quimico_id": "chemical-lot-uuid",
      "dosis": "0.100",
      "dosis_unidad": "L/L",
      "batch": "LOT-A-001",
      "withholding_period_dias": 7,
      "created_at": "…",
      "updated_at": "…",

      // ── NUEVO ──
      "usuario": { "id": "user-uuid", "nombre": "Tobias", "apellido": "Morel", "email": "tobias@example.com" }, // o null
      "target_count": 8,
      "target_summary": {
        "tunnels": [
          { "id": "tunnel-uuid", "nombre": "Tunnel 3", "table_count": 5 },
          { "id": "tunnel-uuid-2", "nombre": "Tunnel 5", "table_count": 3 }
        ],
        "seedings": []
      },
      "chemical_lines": [
        {
          "lote_quimico_id": "chemical-lot-uuid",
          "chemical_id": "chemical-uuid",
          "chemical_name": "Chemical A",
          "lot_name": "LOT-A-001",
          "quantity": 0.8,
          "unit": "L",
          "dose": 0.1,                      // solo en línea principal
          "dose_unit": "L/L",               // solo en línea principal
          "withholding_period_days": 7,     // solo en línea principal
          "brand": { "id": "brand-uuid", "nombre": "Brand A" },      // o null
          "supplier": { "id": "supplier-uuid", "nombre": "Supplier A" } // o null
        }
        // líneas adicionales: dose/dose_unit/withholding_period_days = null
      ]
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 143 }
}
```

### Respuesta (item nursery — solo difiere `target_summary`)

```jsonc
"target_count": 71,
"target_summary": {
  "tunnels": [],
  "seedings": [
    {
      "id": "seeding-uuid",
      "created_at": "2026-07-22T17:48:00.000Z",
      "tray_count": 71,
      "product": { "id": "product-uuid", "nombre": "Asian Green" },   // null si heterogéneo/inexistente
      "variety": { "id": "variety-uuid", "nombre": "Winter Variety" } // null si heterogéneo/inexistente
    }
  ]
}
```

Reglas: sin arrays completos de `mesa_ids`/`bandeja_ids` en el listado; una aplicación puede tener túneles o siembras múltiples; aplicación sin vínculos ⇒ `target_count: 0` y arrays vacíos.

## GET /aplicaciones-quimicas/:id

### Respuesta greenhouse

```jsonc
{
  "ok": true,
  "data": {
    "aplicacion": { /* campos actuales intactos + "usuario": {…} | null */ },
    "detalles": [ /* filas actuales intactas */ ],
    "mesa_ids": ["table-uuid-1", "table-uuid-2"],   // se mantiene
    "targets": {                                     // NUEVO
      "context": "greenhouse",
      "total": 2,
      "tunnels": [
        {
          "id": "tunnel-uuid",
          "nombre": "Tunnel 5",
          "tables": [
            { "id": "table-uuid-1", "nombre": "Table 21", "posicion_actual": 21, "estado": "activa" },
            { "id": "table-uuid-2", "nombre": "Table 22", "posicion_actual": 22, "estado": "activa" }
          ]
        }
      ]
    }
  }
}
```

### Respuesta nursery

```jsonc
{
  "ok": true,
  "data": {
    "aplicacion": { /* + "usuario" */ },
    "detalles": [ /* intactas */ ],
    "bandeja_ids": ["tray-uuid-1", "tray-uuid-2"],  // se mantiene
    "targets": {
      "context": "nursery",
      "total": 2,
      "seedings": [
        {
          "id": "seeding-uuid",
          "created_at": "2026-07-22T17:48:00.000Z",
          "tray_count": 2,
          "product": { "id": "product-uuid", "nombre": "Asian Green" },
          "variety": { "id": "variety-uuid", "nombre": "Winter Variety" },
          "seed_lot": { "id": "seed-lot-uuid", "numero_lote": "SEED-001" },       // null si heterogéneo
          "substrate_lot": { "id": "substrate-lot-uuid", "numero_lote": "SUB-001" }, // null si heterogéneo
          "trays": [
            { "id": "tray-uuid-1", "codigo": "TRAY-001", "estado": "en_nursery" },
            { "id": "tray-uuid-2", "codigo": "TRAY-002", "estado": "trasplantada" }
          ]
        }
      ]
    }
  }
}
```

Reglas: `total` = targets distintos; `posicion_actual`/`estado` son valores **actuales**, no históricos; mesa/túnel/bandeja/siembra eliminados ⇒ ID conservado y enriquecimiento `null` (mesas sin túnel resoluble se agrupan bajo túnel `null`); errores 404/tenant sin cambios; nunca 500 por enriquecimiento faltante.

## Fuera de contrato (sin cambios)

`POST /aplicaciones-quimicas`, `GET /mesas/:mesa_id/aplicaciones`, `GET /bandejas/:bandeja_id/aplicaciones`, descuento de stock, carencias, historial de mesa, roles y auth.
