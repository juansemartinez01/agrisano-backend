# Modulo Trazabilidad - Guia para Frontend

## 1. Objetivo del modulo

El modulo de trazabilidad reconstruye la historia productiva de una cosecha o de una mesa, con foco en compliance: qué se aplicó, cuándo, con qué dosis, de qué proveedor, y si el período de carencia se respetó.

Este modulo no registra datos nuevos. Consulta y enriquece informacion ya generada por otros modulos:

- Mesas, tuneles y establecimientos.
- Trasplantes.
- Siembra y bandejas.
- Lotes de semilla y sustrato.
- Aplicaciones quimicas (lotes de quimico, quimicos, marcas, proveedores).
- Cosecha (producto, variedad, usuario).
- Packing.
- Usuarios (nombre/apellido/email de quien sembró, aplicó, cosechó o empacó).

Desde frontend, este modulo sirve para:

- Ver la trazabilidad completa de una cosecha.
- Ver la historia de cosechas de una mesa.
- Mostrar bandejas que participaron en el ciclo de una cosecha.
- Mostrar origen de siembra y lotes asociados.
- Mostrar aplicaciones quimicas de nursery e invernadero, con el quimico, marca y proveedor usados.
- Mostrar packing asociado a una cosecha, si existe.
- Alertar si una cosecha se registró antes de que venciera el período de carencia de alguna aplicación química.

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

El modulo usa `JwtAuthGuard` + `RolesGuard`. No basta con estar autenticado: se requiere uno de los roles permitidos.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /trazabilidad/cosecha/:cosecha_id` | `operario`, `supervisor`, `admin_global` |
| `GET /trazabilidad/mesa/:mesa_id` | `operario`, `supervisor`, `admin_global` |

Notas:

- Solo usuarios con alguno de esos tres roles pueden consultar trazabilidad.
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
| `403` | `FORBIDDEN` | El usuario no tiene ninguno de los roles permitidos |
| `404` | `COSECHA_NOT_FOUND` | Cosecha inexistente o fuera del tenant |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

## 8. Modelo de datos

Convencion general: todos los campos `*_id` originales se mantienen (para no romper integraciones existentes). Junto a cada uno se agrega un objeto anidado con el nombre resuelto (por ejemplo `usuario_id` + `usuario`, `producto_id` + `producto`). El objeto anidado es `null` si el id es `null` o si el recurso referenciado no se pudo resolver.

### Trazabilidad por cosecha

```ts
type TrazabilidadCosechaResult = {
  cosecha: Cosecha;
  mesa: MesaResumen | null;
  packing: PackingResumen | null;
  bandejas_ciclo: BandejaCiclo[];
  aplicaciones_invernadero: AplicacionResumen[];
  aplicaciones_nursery: AplicacionResumen[];
  alerta_carencia_incumplida: boolean;
};
```

`alerta_carencia_incumplida` es `true` si la cosecha se registró antes de que venciera el período de carencia calculado (`fecha_hora` de la aplicación + `withholding_period_dias`) de alguna aplicación química relevante del ciclo (invernadero o nursery). Es una señal de compliance para mostrar como advertencia destacada en la UI.

### Usuario resumido

Se usa en todos los campos `usuario` de este modulo.

```ts
type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
};
```

### Cosecha

```ts
type Cosecha = {
  id: string;
  tenant_id: string | null;
  mesa_id: string;
  tunel_id: string;
  producto_id: string | null;
  producto: { id: string; nombre: string } | null;
  variedad_id: string | null;
  variedad: { id: string; nombre: string } | null;
  posicion_al_momento: number;
  fecha_hora: string;
  peso_kg: number | string | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
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
  nombre: string;
  estado: string;
  tunel_id: string | null;
  tunel: { nombre: string } | null;
  establecimiento_id: string | null;
  establecimiento: { id: string; nombre: string } | null;
  carencia_hasta: string | null;
};
```

`carencia_hasta` es la fecha (hasta) del último período de carencia activo registrado sobre la mesa por una aplicación química de invernadero. Es `null` si nunca se aplicó un químico con carencia sobre la mesa, o si el último período ya fue seteado sin carencia.

### Bandeja del ciclo

```ts
type BandejaCiclo = {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
  carencia_hasta: string | null;
  siembra: SiembraInfo | null;
};

type SiembraInfo = {
  id: string;
  fecha: string;
  observaciones: string | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
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

`carencia_hasta` aquí es el período de carencia de la bandeja (aplicaciones de nursery), análogo al de la mesa.

### Aplicacion quimica resumida

```ts
type AplicacionResumen = {
  id: string;
  fecha_hora: string;
  observaciones: string | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  contexto: "nursery" | "greenhouse";
  establecimiento_id: string;
  lote_quimico_id: string | null;
  dosis: number | string | null;
  dosis_unidad: string | null;
  batch: string | null;
  withholding_period_dias: number | null;
  lote_quimico: LoteQuimicoResumen | null;
  carencia_hasta_calculada: string | null;
  detalles: AplicacionDetalle[] | null;
};

type LoteQuimicoResumen = {
  id: string;
  numero_lote: string;
  quimico: {
    id: string;
    nombre: string;
    marca: { id: string; nombre: string } | null;
  } | null;
  proveedor: { id: string; nombre: string } | null;
};

type AplicacionDetalle = {
  id: string;
  aplicacion_id: string;
  lote_quimico_id: string;
  cantidad: number | string;
  unidad_medida: string;
  lote_quimico: LoteQuimicoResumen | null;
};
```

- `lote_quimico_id`, `dosis`, `dosis_unidad`, `batch`, `withholding_period_dias` son el snapshot tomado al momento de la aplicación (a nivel cabecera, puede haber más de un químico si la aplicación tiene varios `detalles`).
- `lote_quimico` (a nivel cabecera) enriquece el `lote_quimico_id` principal con el nombre del químico, su marca y su proveedor.
- Cada item de `detalles` trae su propio `lote_quimico` enriquecido de la misma forma (una aplicación puede mezclar varios productos).
- `carencia_hasta_calculada` = `fecha_hora` + `withholding_period_dias` días. Es `null` si la aplicación no tiene período de carencia definido.

### Packing resumido

```ts
type PackingResumen = {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: number | string;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  observaciones: string | null;
  categorias: Record<string, unknown>[] | null;
};
```

### Trazabilidad por mesa

```ts
type TrazabilidadMesaResult = {
  mesa: MesaResumen;
  cosechas: CosechaIndexEntry[];
};

type CosechaIndexEntry = {
  cosecha_id: string;
  fecha_hora: string;
  peso_kg: number | string | null;
  producto_id: string | null;
  producto: { id: string; nombre: string } | null;
  variedad_id: string | null;
  variedad: { id: string; nombre: string } | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  observaciones: string | null;
  posicion_al_momento: number;
  packing: {
    peso_bruto_kg: number | string;
    categorias: Record<string, unknown>[];
  } | null;
};
```

`CosechaIndexEntry` ahora expone los mismos campos que la `Cosecha` completa (antes solo traía `cosecha_id`, `fecha_hora`, `peso_kg` y `packing`). Para el detalle completo del ciclo (bandejas, siembra, aplicaciones), seguir usando el endpoint por cosecha.

Notas:

- Algunos campos decimales pueden venir como string.
- `peso_kg` puede venir `null` si la cosecha se registro sin peso (el campo es opcional en `POST /cosecha`).
- `packing` puede ser `null` si todavia no se registro packing para la cosecha.
- `mesa` en trazabilidad por cosecha puede venir `null` si la fila de mesa no aparece en la query cruda.
- Arrays como `bandejas_ciclo`, `aplicaciones_invernadero` y `aplicaciones_nursery` pueden venir vacios.
- Cualquier objeto anidado de enriquecimiento (`usuario`, `producto`, `variedad`, `lote_quimico`, `establecimiento`, `tunel`) puede venir `null` si el id de origen es `null` o si el recurso referenciado ya no existe.

## 9. Como funciona la trazabilidad

### Trazabilidad por cosecha

El endpoint:

```http
GET /trazabilidad/cosecha/:cosecha_id
```

Hace este recorrido:

1. Valida que la cosecha exista en el tenant.
2. En paralelo: carga informacion resumida de la mesa (con tunel y establecimiento), busca la fecha de trasplante mas reciente antes o igual a la fecha de cosecha, busca packing asociado, y resuelve nombre de producto/variedad/usuario de la cosecha.
3. Con la fecha de ciclo, en paralelo: obtiene las bandejas del ciclo (con siembra, lotes y usuario de siembra) y las aplicaciones quimicas de invernadero sobre la mesa entre trasplante y cosecha (con quimico/marca/proveedor).
4. Busca aplicaciones quimicas de nursery sobre las bandejas del ciclo (con el mismo enriquecimiento).
5. Calcula `alerta_carencia_incumplida` comparando la fecha de cosecha contra el período de carencia calculado de cada aplicación relevante.

### Trazabilidad por mesa

El endpoint:

```http
GET /trazabilidad/mesa/:mesa_id
```

Hace este recorrido:

1. Valida que la mesa exista en el tenant.
2. Devuelve informacion resumida de la mesa (con tunel y establecimiento).
3. Lista todas sus cosechas, con producto/variedad/usuario resueltos.
4. Para cada cosecha, incluye resumen de packing si existe.

## 10. Endpoints

### 10.1. Trazabilidad por cosecha

```http
GET /trazabilidad/cosecha/:cosecha_id
```

Roles:

- `operario`, `supervisor`, `admin_global`.

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
      "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
      "producto": { "id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e", "nombre": "Tomate" },
      "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
      "variedad": { "id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e", "nombre": "Cherry" },
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "usuario": {
        "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "email": "operario1@agrisano.com",
        "nombre": "Juan",
        "apellido": "Pérez"
      },
      "observaciones": "Cosecha lote mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "mesa": {
      "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
      "nombre": "Mesa 12",
      "estado": "en_cosecha",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "tunel": { "nombre": "Tunel A" },
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "establecimiento": { "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731", "nombre": "Finca Norte" },
      "carencia_hasta": null
    },
    "packing": {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "fecha_hora": "2026-06-09T13:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "usuario": {
        "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "email": "operario1@agrisano.com",
        "nombre": "Juan",
        "apellido": "Pérez"
      },
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
        "carencia_hasta": null,
        "siembra": {
          "id": "ce455fd5-4e1c-4d3d-893a-b16a0c1e2c8c",
          "fecha": "2026-05-20T12:00:00.000Z",
          "observaciones": "Siembra inicial",
          "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
          "usuario": {
            "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
            "email": "operario1@agrisano.com",
            "nombre": "Juan",
            "apellido": "Pérez"
          },
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
        "observaciones": "Aplicacion en mesa",
        "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "usuario": {
          "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
          "email": "operario1@agrisano.com",
          "nombre": "Juan",
          "apellido": "Pérez"
        },
        "contexto": "greenhouse",
        "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
        "lote_quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "dosis": "2.500",
        "dosis_unidad": "l_ha",
        "batch": "LQ-2026-014",
        "withholding_period_dias": 3,
        "lote_quimico": {
          "id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
          "numero_lote": "LQ-2026-014",
          "quimico": {
            "id": "c1a1e9b0-9b1a-4f3a-8b8a-2e6a7b9c1d2e",
            "nombre": "Fungicida X",
            "marca": { "id": "d2b2f0c1-0c2b-5a4b-9c9b-3f7b8c0d2e3f", "nombre": "AgroMarca" }
          },
          "proveedor": { "id": "e3c3a1d2-1d3c-6b5c-0d0c-4a8c9d1e3f4a", "nombre": "Distribuidora del Sur" }
        },
        "carencia_hasta_calculada": "2026-06-08T12:00:00.000Z",
        "detalles": [
          {
            "id": "b0ebf981-5890-4130-9592-60c0e4b11c65",
            "aplicacion_id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
            "lote_quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
            "cantidad": "2.000",
            "unidad_medida": "L",
            "lote_quimico": {
              "id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
              "numero_lote": "LQ-2026-014",
              "quimico": {
                "id": "c1a1e9b0-9b1a-4f3a-8b8a-2e6a7b9c1d2e",
                "nombre": "Fungicida X",
                "marca": { "id": "d2b2f0c1-0c2b-5a4b-9c9b-3f7b8c0d2e3f", "nombre": "AgroMarca" }
              },
              "proveedor": { "id": "e3c3a1d2-1d3c-6b5c-0d0c-4a8c9d1e3f4a", "nombre": "Distribuidora del Sur" }
            }
          }
        ]
      }
    ],
    "aplicaciones_nursery": [],
    "alerta_carencia_incumplida": true
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
- `alerta_carencia_incumplida: true` en el ejemplo porque la cosecha (`2026-06-09`) ocurrió antes de que venciera la carencia calculada de la aplicación (`2026-06-08`) — mostrar esto como advertencia visible en la UI.

### 10.2. Trazabilidad por mesa

```http
GET /trazabilidad/mesa/:mesa_id
```

Roles:

- `operario`, `supervisor`, `admin_global`.

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
      "nombre": "Mesa 12",
      "estado": "en_cosecha",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "tunel": { "nombre": "Tunel A" },
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "establecimiento": { "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731", "nombre": "Finca Norte" },
      "carencia_hasta": null
    },
    "cosechas": [
      {
        "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
        "fecha_hora": "2026-06-09T12:00:00.000Z",
        "peso_kg": "12.500",
        "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
        "producto": { "id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e", "nombre": "Tomate" },
        "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
        "variedad": { "id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e", "nombre": "Cherry" },
        "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
        "usuario": {
          "id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
          "email": "operario1@agrisano.com",
          "nombre": "Juan",
          "apellido": "Pérez"
        },
        "observaciones": "Cosecha lote mañana",
        "posicion_al_momento": 1,
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
- Este endpoint funciona bien como indice o resumen. Para trazabilidad completa (bandejas, siembra, aplicaciones, alerta de carencia), usar el endpoint por cosecha.

## 11. Flujos recomendados para frontend

### Flujo de trazabilidad por cosecha

1. Recibir o seleccionar `cosecha_id`.
2. Enviar `GET /trazabilidad/cosecha/:cosecha_id`.
3. Mostrar bloque principal de cosecha (con producto/variedad/usuario resueltos).
4. Mostrar resumen de mesa (con tunel y establecimiento).
5. Si `data.alerta_carencia_incumplida === true`, mostrar advertencia destacada de compliance.
6. Mostrar packing si `data.packing !== null`.
7. Mostrar bandejas del ciclo.
8. Para cada bandeja, mostrar siembra y lotes.
9. Mostrar aplicaciones de nursery e invernadero, incluyendo quimico/marca/proveedor y período de carencia calculado.
10. Si algun array viene vacio, mostrar estado vacio especifico.

### Flujo de trazabilidad por mesa

1. Recibir o seleccionar `mesa_id`.
2. Enviar `GET /trazabilidad/mesa/:mesa_id`.
3. Mostrar datos de la mesa (con `carencia_hasta` si está activa).
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
- No asumir que los objetos de enriquecimiento (`usuario`, `producto`, `variedad`, `lote_quimico`, `establecimiento`, `tunel`) existen: siempre pueden ser `null` aunque el `*_id` correspondiente no lo sea (por ejemplo, si el recurso referenciado fue borrado).
- Destacar visualmente `alerta_carencia_incumplida: true` — es una señal de incumplimiento de seguridad alimentaria, no un dato secundario.
- En trazabilidad por mesa, usar cada `cosecha_id` como link al detalle completo.
- Ante `COSECHA_NOT_FOUND` o `MESA_NOT_FOUND`, mostrar que el recurso no existe o no pertenece al tenant actual.
- Ante `403`, mostrar que el usuario no tiene el rol necesario para ver trazabilidad.

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

if (trazabilidad.alerta_carencia_incumplida) {
  // Mostrar advertencia: la cosecha pudo haberse hecho dentro del período de carencia.
}
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

if (!data.cosecha.usuario) {
  // El usuario que registró la cosecha ya no existe o no tiene nombre cargado; mostrar solo el id o "Usuario desconocido".
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

  if (err?.statusCode === 403) {
    // Mostrar que el usuario no tiene rol suficiente.
  }
}
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Todos los endpoints se llaman con JWT.
- El usuario logueado tiene uno de los roles `operario`, `supervisor` o `admin_global` (sino, la UI debe ocultar el acceso a trazabilidad).
- Trazabilidad por cosecha usa `cosecha_id`.
- Trazabilidad por mesa usa `mesa_id`.
- La UI maneja `packing: null`.
- La UI maneja `mesa: null` en respuesta por cosecha.
- La UI maneja arrays vacios.
- La UI maneja `siembra: null` en bandejas.
- La UI maneja objetos de enriquecimiento en `null` (`usuario`, `producto`, `variedad`, `lote_quimico`, `establecimiento`, `tunel`) por separado de sus `*_id`.
- La UI destaca `alerta_carencia_incumplida: true` como advertencia de compliance.
- La UI no asume que los decimales llegan como number.
- El resumen por mesa permite abrir detalle por cosecha.
- Los errores leen `error.code` y `error.message`.
- La UI maneja `COSECHA_NOT_FOUND`.
- La UI maneja `MESA_NOT_FOUND`.
- La UI maneja `403` (rol insuficiente).
