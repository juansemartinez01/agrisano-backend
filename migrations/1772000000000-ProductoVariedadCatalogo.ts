import { MigrationInterface, QueryRunner } from "typeorm";

const PRODUCTO_NOMBRE = `CASE l.producto WHEN 'lechuga' THEN 'Lechuga' WHEN 'espinaca' THEN 'Espinaca' WHEN 'rucula' THEN 'Rúcula' END`;

export class ProductoVariedadCatalogo1772000000000 implements MigrationInterface {
    name = 'ProductoVariedadCatalogo1772000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. productos ─────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "productos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "nombre" character varying(150) NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_productos" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_productos_tenant_id" ON "productos" ("tenant_id")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_productos_tenant_nombre"
                ON "productos" ("tenant_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);

        // ── 2. variedades ────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "variedades" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "producto_id" uuid NOT NULL,
                "nombre" character varying(150) NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_variedades" PRIMARY KEY ("id"),
                CONSTRAINT "FK_variedades_producto" FOREIGN KEY ("producto_id")
                    REFERENCES "productos"("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_variedades_tenant_id" ON "variedades" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_variedades_producto_id" ON "variedades" ("producto_id")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_variedades_tenant_producto_nombre"
                ON "variedades" ("tenant_id", "producto_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);

        // ── 3. Backfill: Productos desde el enum viejo lote_producto ────────
        await queryRunner.query(`
            INSERT INTO "productos" ("id", "tenant_id", "nombre", "activo")
            SELECT gen_random_uuid(), t.tenant_id, t.nombre, true
            FROM (
                SELECT DISTINCT tenant_id,
                    CASE producto WHEN 'lechuga' THEN 'Lechuga' WHEN 'espinaca' THEN 'Espinaca' WHEN 'rucula' THEN 'Rúcula' END AS nombre
                FROM "lotes" WHERE producto IS NOT NULL
            ) t
        `);

        // ── 4. Backfill: Variedades desde el texto libre viejo ──────────────
        await queryRunner.query(`
            INSERT INTO "variedades" ("id", "tenant_id", "producto_id", "nombre", "activo")
            SELECT gen_random_uuid(), t.tenant_id, p.id, t.variedad, true
            FROM (
                SELECT DISTINCT l.tenant_id, l.producto, l.variedad
                FROM "lotes" l
                WHERE l.producto IS NOT NULL AND l.variedad IS NOT NULL
            ) t
            JOIN "productos" p
                ON p.tenant_id IS NOT DISTINCT FROM t.tenant_id
                AND p.nombre = (CASE t.producto WHEN 'lechuga' THEN 'Lechuga' WHEN 'espinaca' THEN 'Espinaca' WHEN 'rucula' THEN 'Rúcula' END)
        `);

        // ── 5. lotes: producto/variedad (enum + texto) -> producto_id/variedad_id (FK) ─
        await queryRunner.query(`ALTER TABLE "lotes" ADD "producto_id" uuid`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "variedad_id" uuid`);

        await queryRunner.query(`
            UPDATE "lotes" l SET "producto_id" = p.id
            FROM "productos" p
            WHERE l.producto IS NOT NULL
                AND p.tenant_id IS NOT DISTINCT FROM l.tenant_id
                AND p.nombre = (${PRODUCTO_NOMBRE})
        `);
        await queryRunner.query(`
            UPDATE "lotes" l SET "variedad_id" = v.id
            FROM "variedades" v
            WHERE l.variedad IS NOT NULL
                AND v.producto_id = l.producto_id
                AND v.nombre = l.variedad
        `);

        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "producto"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "variedad"`);
        await queryRunner.query(`DROP TYPE "lote_producto"`);

        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "FK_lotes_producto"
                FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "lotes" ADD CONSTRAINT "FK_lotes_variedad"
                FOREIGN KEY ("variedad_id") REFERENCES "variedades"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_producto_id" ON "lotes" ("producto_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_variedad_id" ON "lotes" ("variedad_id")`);

        // ── 6. cosechas: nuevo producto_id/variedad_id (sin backfill posible) ─
        await queryRunner.query(`ALTER TABLE "cosechas" ADD "producto_id" uuid`);
        await queryRunner.query(`ALTER TABLE "cosechas" ADD "variedad_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "cosechas" ADD CONSTRAINT "FK_cosechas_producto"
                FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cosechas" ADD CONSTRAINT "FK_cosechas_variedad"
                FOREIGN KEY ("variedad_id") REFERENCES "variedades"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_producto_id" ON "cosechas" ("producto_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_variedad_id" ON "cosechas" ("variedad_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── 6. cosechas ──────────────────────────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_variedad_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_producto_id"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP CONSTRAINT "FK_cosechas_variedad"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP CONSTRAINT "FK_cosechas_producto"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP COLUMN "variedad_id"`);
        await queryRunner.query(`ALTER TABLE "cosechas" DROP COLUMN "producto_id"`);

        // ── 5. lotes: restaurar enum + texto libre ──────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_variedad_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_producto_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "FK_lotes_variedad"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP CONSTRAINT "FK_lotes_producto"`);

        await queryRunner.query(`CREATE TYPE "lote_producto" AS ENUM ('lechuga', 'espinaca', 'rucula')`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "producto" "lote_producto"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "variedad" character varying(200)`);

        await queryRunner.query(`
            UPDATE "lotes" l SET "producto" = (
                CASE p.nombre WHEN 'Lechuga' THEN 'lechuga'::lote_producto WHEN 'Espinaca' THEN 'espinaca'::lote_producto WHEN 'Rúcula' THEN 'rucula'::lote_producto END
            )
            FROM "productos" p WHERE p.id = l.producto_id
        `);
        await queryRunner.query(`
            UPDATE "lotes" l SET "variedad" = v.nombre
            FROM "variedades" v WHERE v.id = l.variedad_id
        `);

        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "variedad_id"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "producto_id"`);

        // ── 1-2. drop productos/variedades ──────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_variedades_tenant_producto_nombre"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_variedades_producto_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_variedades_tenant_id"`);
        await queryRunner.query(`DROP TABLE "variedades"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_productos_tenant_nombre"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_productos_tenant_id"`);
        await queryRunner.query(`DROP TABLE "productos"`);
    }
}
