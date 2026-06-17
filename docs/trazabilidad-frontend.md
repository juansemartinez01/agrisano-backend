# Modulo Trazabilidad - Guia para Frontend

## 1. Objetivo del modulo

El modulo de trazabilidad reconstruye la historia productiva de una cosecha o de una mesa.

Este modulo no registra datos nuevos. Consulta informacion ya generada por otros modulos:

- Mesas.
- Trasplantes.
- Siembra y bandejas.
- Lotes de semilla y sustrato.
- Aplicaciones quimicas.
- Cosecha.
- Packing.

Desde frontend, este modulo sirve para:

- Ver la trazabilidad completa de una cosecha.
- Ver la historia de cosechas de una mesa.
- Mostrar bandejas que participaron en el ciclo de una cosecha.
- Mostrar origen de siembra y lotes asociados.
- Mostrar aplicaciones quimicas de nursery e invernadero.
- Mostrar packing asociado a una cosecha, si existe.

Controlador del modulo:

- `TrazabilidadController`: rutas bajo `/trazabilidad/cosecha/:cosecha_id` y `/trazabilidad/mesa/:mesa_id`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/trazabilidad/cosecha/a6765e17-b76d-43dd-8236-d22675d1ed57
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de trazabilidad requieren JWT.

Header obligatorio:

```http
Authorization: Bearer <access_token>
```

El token se obtiene con:

```http
POST /auth/login
```

Body:

```json
{
  "email": "admin@agrisano.com",
  "password": "password"
}
```

Respuesta esperada:

```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt..."
}
```

Importante: los roles quedan dentro del JWT al momento del login. Si se cambian roles en base de datos, el usuario debe volver a iniciar sesion para obtener un token nuevo.

## 4. Tenancy

El modulo trabaja siempre dentro del tenant actual.

El tenant puede venir:

- Dentro del JWT como `tenant_id`.
- Por header `x-tenant-id`.
- Opcionalmente por header `x-tenant-key`, segun configuracion del backend.

Headers recomendados:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si falta tenant, el backend puede responder:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "TENANT_REQUIRED",
    "message": "Tenant is required"
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/trazabilidad/cosecha/a6765e17-b76d-43dd-8236-d22675d1ed57"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /trazabilidad/cosecha/:cosecha_id` | Cualquier usuario autenticado |
| `GET /trazabilidad/mesa/:mesa_id` | Cualquier usuario autenticado |

Notas:

- Este modulo no usa `RolesGuard`.
- Cualquier usuario con JWT valido puede consultar trazabilidad.
- El acceso sigue limitado al tenant actual.

## 6. Formato general de respuestas exitosas

Respuesta simple:

```json
{
  "ok": true,
  "data": {}
}
```

Este modulo no devuelve respuestas paginadas.

## 7. Formato general de errores

Todos los errores pasan por el filtro global y mantienen este formato:

```json
{
  "ok": false,
  "requestId": "73f4ee70-9f53-40ca-909b-ed202713b7e3",
  "statusCode": 404,
  "error": {
    "code": "COSECHA_NOT_FOUND",
    "message": "Cosecha no encontrada"
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/trazabilidad/cosecha/a6765e17-b76d-43dd-8236-d22675d1ed57"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Parametro invalido |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `404` | `COSECHA_NOT_FOUND` | Cosecha inexistente o fuera del tenant |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

## 8. Modelo de datos

### Trazabilidad por cosecha

```ts
type TrazabilidadCosechaResult = {
  cosecha: Cosecha;
  mesa: MesaResumen | null;
  packing: PackingResumen | null;
  bandejas_ciclo: BandejaCiclo[];
  aplicaciones_invernadero: AplicacionResumen[];
  aplicaciones_nursery: AplicacionResumen[];
};
```

### Cosecha

```ts
type Cosecha = {
  id: string;
  tenant_id: string | null;
  mesa_id: string;
  tunel_id: string;
  posicion_al_momento: number;
  fecha_hora: string;
  peso_kg: number | string;
  usuario_id: string;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
};
```

### Mesa resumida

```ts
type MesaResumen = {
  id: string;
  codigo_qr: string;
  estado: string;
  tunel_id: string | null;
  establecimiento_id: string | null;
};
```

### Bandeja del ciclo

```ts
type BandejaCiclo = {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
  siembra: SiembraInfo | null;
};

type SiembraInfo = {
  id: string;
  fecha: string;
  observaciones: string | null;
  usuario_id: string;
  lote_semilla: {
    id: string;
    numero_lote: string;
    tipo: string;
  };
  lote_sustrato: {
    id: string;
    numero_lote: string;
    tipo: string;
  };
};
```

### Aplicacion quimica resumida

```ts
type AplicacionResumen = {
  id: string;
  fecha_hora: string;
  receta_id: string | null;
  observaciones: string | null;
  usuario_id: string;
  detalles: Record<string, unknown>[] | null;
};
```

### Packing resumido

```ts
type PackingResumen = {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: number | string;
  usuario_id: string;
  observaciones: string | null;
  categorias: Record<string, unknown>[] | null;
};
```

### Trazabilidad por mesa

```ts
type TrazabilidadMesaResult = {
  mesa: {
    id: string;
    codigo_qr: string;
    estado: string;
    tunel_id: string | null;
    establecimiento_id: string | null;
  };
  cosechas: CosechaIndexEntry[];
};

type CosechaIndexEntry = {
  cosecha_id: string;
  fecha_hora: string;
  peso_kg: number | string;
  packing: {
    peso_bruto_kg: number | string;
    categorias: Record<string, unknown>[];
  } | null;
};
```

Notas:

- Algunos campos decimales pueden venir como string.
- `packing` puede ser `null` si todavia no se registro packing para la cosecha.
- `mesa` en trazabilidad por cosecha puede venir `null` si la fila de mesa no aparece en la query cruda.
- Arrays como `bandejas_ciclo`, `aplicaciones_invernadero` y `aplicaciones_nursery` pueden venir vacios.

## 9. Como funciona la trazabilidad

### Trazabilidad por cosecha

El endpoint:

```http
GET /trazabilidad/cosecha/:cosecha_id
```

Hace este recorrido:

1. Valida que la cosecha exista en el tenant.
2. Carga informacion resumida de la mesa.
3. Busca la fecha de trasplante mas reciente de la mesa antes o igual a la fecha de cosecha.
4. Con esa fecha, obtiene las bandejas del ciclo.
5. Para cada bandeja, agrega siembra y lotes de semilla/sustrato.
6. Busca packing asociado a la cosecha.
7. Busca aplicaciones quimicas de invernadero sobre la mesa entre trasplante y cosecha.
8. Busca aplicaciones quimicas de nursery sobre las bandejas del ciclo.

### Trazabilidad por mesa

El endpoint:

```http
GET /trazabilidad/mesa/:mesa_id
```

Hace este recorrido:

1. Valida que la mesa exista en el tenant.
2. Devuelve informacion resumida de la mesa.
3. Lista todas sus cosechas.
4. Para cada cosecha, incluye resumen de packing si existe.

## 10. Endpoints

### 10.1. Trazabilidad por cosecha

```http
GET /trazabilidad/cosecha/:cosecha_id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /trazabilidad/cosecha/a6765e17-b76d-43dd-8236-d22675d1ed57
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "cosecha": {
      "id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Cosecha lote mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "mesa": {
      "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
      "estado": "en_cosecha",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731"
    },
    "packing": {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "fecha_hora": "2026-06-09T13:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Packing turno mañana",
      "categorias": [
        {
          "id": "62adab46-8427-4d89-bb34-1df5386d7355",
          "lote_packing_id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
          "categoria": "primera",
          "peso_kg": "8.500",
          "cantidad_cajas": 4,
          "peso_neto_por_caja": "2.125"
        }
      ]
    },
    "bandejas_ciclo": [
      {
        "bandeja_id": "4c033b74-1f8d-4389-9457-51cd5d3e3940",
        "fecha_trasplante": "2026-06-01T12:00:00.000Z",
        "siembra_id": "ce455fd5-4e1c-4d3d-893a-b16a0c1e2c8c",
        "lote_semilla_id": "622dd2be-d38b-4f43-8abd-a41266018e34",
        "lote_sustrato_id": "2884aac5-75a0-4fda-a72e-9804079e51c7",
        "estado": "trasplantada",
        "siembra": {
          "id": "ce455fd5-4e1c-4d3d-893a-b16a0c1e2c8c",
          "fecha": "2026-05-20T12:00:00.000Z",
          "observaciones": "Siembra inicial",
          "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
          "lote_semilla": {
            "id": "622dd2be-d38b-4f43-8abd-a41266018e34",
            "numero_lote": "SEM-001",
            "tipo": "semilla"
          },
          "lote_sustrato": {
            "id": "2884aac5-75a0-4fda-a72e-9804079e51c7",
            "numero_lote": "SUS-001",
            "tipo": "sustrato"
          }
        }
      }
    ],
    "aplicaciones_invernadero": [
      {
        "id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
        "fecha_hora": "2026-06-05T12:00:00.000Z",
        "receta_id": null,
        "observaciones": "Aplicacion en mesa",
        "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "detalles": [
          {
            "id": "b0ebf981-5890-4130-9592-60c0e4b11c65",
            "aplicacion_id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
            "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
            "cantidad": "2.000",
            "unidad_medida": "litros"
          }
        ]
      }
    ],
    "aplicaciones_nursery": []
  }
}
```

Errores comunes:

- `404 COSECHA_NOT_FOUND`: cosecha inexistente o fuera del tenant.

Notas:

- `packing` puede ser `null`.
- `bandejas_ciclo` puede venir vacio si no hay trasplante previo detectado.
- `aplicaciones_invernadero` puede venir vacio si no hubo aplicaciones en la ventana del ciclo.
- `aplicaciones_nursery` puede venir vacio si no hubo aplicaciones sobre las bandejas.

### 10.2. Trazabilidad por mesa

```http
GET /trazabilidad/mesa/:mesa_id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /trazabilidad/mesa/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "mesa": {
      "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
      "estado": "en_cosecha",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731"
    },
    "cosechas": [
      {
        "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
        "fecha_hora": "2026-06-09T12:00:00.000Z",
        "peso_kg": "12.500",
        "packing": {
          "peso_bruto_kg": "12.500",
          "categorias": [
            {
              "id": "62adab46-8427-4d89-bb34-1df5386d7355",
              "lote_packing_id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
              "categoria": "primera",
              "peso_kg": "8.500",
              "cantidad_cajas": 4,
              "peso_neto_por_caja": "2.125"
            }
          ]
        }
      }
    ]
  }
}
```

Errores comunes:

- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.

Notas:

- `cosechas` puede venir vacio.
- `packing` dentro de cada cosecha puede ser `null`.
- Este endpoint funciona bien como indice o resumen. Para trazabilidad completa, usar el endpoint por cosecha.

## 11. Flujos recomendados para frontend

### Flujo de trazabilidad por cosecha

1. Recibir o seleccionar `cosecha_id`.
2. Enviar `GET /trazabilidad/cosecha/:cosecha_id`.
3. Mostrar bloque principal de cosecha.
4. Mostrar resumen de mesa.
5. Mostrar packing si `data.packing !== null`.
6. Mostrar bandejas del ciclo.
7. Para cada bandeja, mostrar siembra y lotes.
8. Mostrar aplicaciones de nursery.
9. Mostrar aplicaciones de invernadero.
10. Si algun array viene vacio, mostrar estado vacio especifico.

### Flujo de trazabilidad por mesa

1. Recibir o seleccionar `mesa_id`.
2. Enviar `GET /trazabilidad/mesa/:mesa_id`.
3. Mostrar datos de la mesa.
4. Mostrar lista de cosechas.
5. Si una cosecha tiene `packing`, mostrar resumen.
6. Permitir abrir detalle completo llamando a `/trazabilidad/cosecha/:cosecha_id`.

### Flujo desde QR de mesa

1. Escanear QR.
2. Obtener mesa con `GET /mesas/qr/:codigoQr`.
3. Tomar `data.id`.
4. Consultar `GET /trazabilidad/mesa/:mesa_id`.
5. Mostrar historial de cosechas de esa mesa.

## 12. Consideraciones de UI/UX

- Este modulo es de lectura; no mostrar acciones de edicion.
- Presentar la trazabilidad por secciones: cosecha, mesa, ciclo, nursery, invernadero, packing.
- Mostrar estados vacios claros para packing, bandejas, aplicaciones nursery e invernadero.
- Usar una linea de tiempo si la pantalla lo permite.
- Convertir decimales string a numero solo para calculos; para mostrar, formatear con cuidado.
- No asumir que `packing` existe.
- No asumir que `bandejas_ciclo` tiene datos.
- No asumir que `siembra` existe dentro de cada bandeja.
- En trazabilidad por mesa, usar cada `cosecha_id` como link al detalle completo.
- Ante `COSECHA_NOT_FOUND` o `MESA_NOT_FOUND`, mostrar que el recurso no existe o no pertenece al tenant actual.

## 13. Ejemplos con fetch

### Cliente base

```ts
const baseUrl = "http://localhost:3000";

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const tenantId = localStorage.getItem("tenant_id");

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(options.headers ?? {})
    }
  });

  const json = await res.json();

  if (!res.ok) {
    throw json;
  }

  return json;
}
```

### Obtener trazabilidad por cosecha

```ts
const response = await apiFetch(`/trazabilidad/cosecha/${cosechaId}`);

const trazabilidad = response.data;
const cosecha = trazabilidad.cosecha;
const packing = trazabilidad.packing;
const bandejas = trazabilidad.bandejas_ciclo;
```

### Obtener trazabilidad por mesa

```ts
const response = await apiFetch(`/trazabilidad/mesa/${mesaId}`);

const mesa = response.data.mesa;
const cosechas = response.data.cosechas;
```

### Manejo de nulos

```ts
const response = await apiFetch(`/trazabilidad/cosecha/${cosechaId}`);
const data = response.data;

if (!data.packing) {
  // Mostrar "Sin packing registrado".
}

if (data.bandejas_ciclo.length === 0) {
  // Mostrar "Sin bandejas detectadas para este ciclo".
}

if (data.aplicaciones_invernadero.length === 0) {
  // Mostrar "Sin aplicaciones en invernadero".
}

if (data.aplicaciones_nursery.length === 0) {
  // Mostrar "Sin aplicaciones en nursery".
}
```

### Manejo de errores especificos

```ts
try {
  await apiFetch(`/trazabilidad/cosecha/${cosechaId}`);
} catch (err: any) {
  const code = err?.error?.code;

  if (code === "COSECHA_NOT_FOUND") {
    // Mostrar que la cosecha no existe o no pertenece al tenant.
  }

  if (code === "MESA_NOT_FOUND") {
    // Mostrar que la mesa no existe o no pertenece al tenant.
  }
}
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Todos los endpoints se llaman con JWT.
- No se requieren roles especiales mas alla de estar autenticado.
- Trazabilidad por cosecha usa `cosecha_id`.
- Trazabilidad por mesa usa `mesa_id`.
- La UI maneja `packing: null`.
- La UI maneja `mesa: null` en respuesta por cosecha.
- La UI maneja arrays vacios.
- La UI maneja `siembra: null` en bandejas.
- La UI no asume que los decimales llegan como number.
- El resumen por mesa permite abrir detalle por cosecha.
- Los errores leen `error.code` y `error.message`.
- La UI maneja `COSECHA_NOT_FOUND`.
- La UI maneja `MESA_NOT_FOUND`.
