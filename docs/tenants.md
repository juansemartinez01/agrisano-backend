# Tenants

## Cómo funciona el multitenant

No hay tabla `tenants`. Un tenant es simplemente un UUID que vive en la columna
`tenant_id` de cada tabla. "Crear un tenant" significa elegir un UUID y cargar
datos con ese valor.

El flujo es:

```
header x-tenant-id  →  TenancyMiddleware  →  AsyncLocalStorage (tenantContext)
                                          →  TenancyService.requireTenantId()
                                          →  applyTenantScope() en cada query
```

Dos cosas a tener en cuenta:

- **El header manda.** El middleware corre antes que los guards de NestJS, así
  que `req.user` siempre es `undefined` ahí. La rama que preferiría el tenant
  del JWT existe en el código pero nunca se ejecuta.
- **El JWT valida contra el header.** `JwtStrategy.validate` tira
  `401 Tenant mismatch` si el tenant del token no coincide con el del header
  (siempre que `TENANCY_ENABLED` esté activo). Eso es lo que impide que alguien
  con un token válido lea otro tenant cambiando el header.
- **Sin header no se puede operar.** `applyTenantScope` falla cerrado: si no hay
  tenant en contexto agrega `1=0` a la query, con lo cual no devuelve nada.

## Tenants existentes

| Tenant | UUID | Admin |
|---|---|---|
| Producción | `00000000-0000-0000-0000-000000000001` | `admin@agrisano.com` |
| Pruebas | `00000000-0000-0000-0000-000000000002` | `admin@tenantpruebas.com` |

Ambos tienen el mismo contenido: 1 establecimiento (Agrisano, Adelaide),
6 túneles de capacidad 122, 732 mesas posicionadas 1..122 según su nombre,
catálogo INIT (proveedor, marca, producto, variedad), 3 lotes INIT
(semilla, sustrato, vermiculita), 6 siembras, 732 bandejas trasplantadas.

El seed de deploy (`entrypoint.sh` → `npm run db:seed`) sólo toca
`SEED_TENANT_ID`, así que no interfiere con el tenant de pruebas.

## Scripts

`scripts/crear-tenant.js` replica la estructura de un tenant en otro vía API.

```bash
API_URL="..." DATABASE_URL="..." \
SOURCE_TENANT_ID="00000000-0000-0000-0000-000000000001" \
TENANT_ID="00000000-0000-0000-0000-000000000003" \
ADMIN_EMAIL="admin@otro.com" ADMIN_PASSWORD="..." \
node scripts/crear-tenant.js
```

Crea el usuario admin por SQL (los endpoints de alta de usuarios crean en el
tenant del que llama, así que hay un problema de huevo y gallina), y el resto
por API con el token de ese admin nuevo. Acepta `--dry-run`.

Después hay que correr `scripts/seed-init-trasplante.js` con el `TENANT_ID`
nuevo para dejar las mesas con bandeja y posición.

`scripts/verificar-tenants.js` corre 52 pruebas de aislamiento y paridad entre
dos tenants: autenticación cruzada, listados, GET por id cruzado, escritura
cruzada, códigos únicos globales y conteo de filas por tabla.

```bash
API_URL="..." DATABASE_URL="..." \
TENANT_A="..." EMAIL_A="..." PASS_A="..." \
TENANT_B="..." EMAIL_B="..." PASS_B="..." \
node scripts/verificar-tenants.js
```

## Cosas que no se pueden clonar tal cual

Tres columnas tienen UNIQUE global, sin `tenant_id` en el índice:

- `mesas.codigo_qr`
- `bandejas.codigo`
- `roles.name`

Por eso el clon se hace re-provisionando por API y no copiando filas: los QR y
los códigos de bandeja del tenant de pruebas son necesariamente distintos.
**Las etiquetas QR impresas del tenant de producción no resuelven en el de
pruebas.**

Los roles son globales (`tenant_id IS NULL`) y se comparten entre tenants. Eso
es intencional: `admin` es el rol de administración de usuarios y `admin_global`
el de administración operativa *dentro del mismo tenant* — el nombre es
engañoso pero es así por diseño.

## Hueco conocido

`principios_activos` **no tiene columna `tenant_id`** y
`principios-activos.service.ts` es el único service sin scoping por tenant. Ese
catálogo va a ser compartido entre todos los tenants apenas se carguen químicos.
Hoy tiene 0 filas, así que todavía no se nota.
