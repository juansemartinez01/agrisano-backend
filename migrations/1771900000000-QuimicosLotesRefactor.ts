import { MigrationInterface, QueryRunner } from "typeorm";

export class QuimicosLotesRefactor1771900000000 implements MigrationInterface {
    name = 'QuimicosLotesRefactor1771900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Drop stock-movimientos (absorbed by lotes-quimicos) ─────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_stock_fecha"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_stock_tipo"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_stock_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_stock_quimico_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_stock_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "movimientos_stock"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "movimiento_tipo"`);

        // ── 2. Simplify quimicos ────────────────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quimicos_proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP CONSTRAINT IF EXISTS "FK_quimicos_proveedor"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "proveedor_id"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "batch"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "dom"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "manufacture_date"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "nombre_lista"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "unidad_stock"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "stock_actual"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "quimico_unidad_stock"`);

        // Normalizar valores existentes fuera de kg|l antes de forzar el enum
        // (unidad_medida era texto libre; datos de prueba tienen 'g'/'ml' sueltos)
        await queryRunner.query(`UPDATE "quimicos" SET "unidad_medida" = 'l' WHERE "unidad_medida" = 'ml'`);
        await queryRunner.query(`UPDATE "quimicos" SET "unidad_medida" = 'kg' WHERE "unidad_medida" = 'g'`);
        await queryRunner.query(`UPDATE "quimicos" SET "unidad_medida" = 'l' WHERE "unidad_medida" NOT IN ('kg', 'l')`);

        await queryRunner.query(`CREATE TYPE "quimico_unidad_medida" AS ENUM ('kg', 'l')`);
        await queryRunner.query(`
            ALTER TABLE "quimicos"
                ALTER COLUMN "unidad_medida" TYPE "quimico_unidad_medida"
                USING "unidad_medida"::"quimico_unidad_medida"
        `);

        // ── 3. lotes_quimicos ────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "lotes_quimicos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "quimico_id" uuid NOT NULL,
                "establecimiento_id" uuid NOT NULL,
                "proveedor_id" uuid NOT NULL,
                "numero_lote" character varying(100) NOT NULL,
                "cantidad_inicial" numeric(10,3) NOT NULL,
                "cantidad_actual" numeric(10,3) NOT NULL,
                "dom" date,
                "fecha_vencimiento" date,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_lotes_quimicos" PRIMARY KEY ("id"),
                CONSTRAINT "FK_lotes_quimicos_quimico" FOREIGN KEY ("quimico_id")
                    REFERENCES "quimicos"("id"),
                CONSTRAINT "FK_lotes_quimicos_proveedor" FOREIGN KEY ("proveedor_id")
                    REFERENCES "proveedores"("id"),
                CONSTRAINT "CHK_lotes_quimicos_cantidad_actual" CHECK ("cantidad_actual" >= 0)
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_quimicos_tenant_id" ON "lotes_quimicos" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_quimicos_quimico_id" ON "lotes_quimicos" ("quimico_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_quimicos_establecimiento_id" ON "lotes_quimicos" ("establecimiento_id")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_lotes_quimicos_tenant_quimico_numero"
                ON "lotes_quimicos" ("tenant_id", "quimico_id", "numero_lote")
                WHERE "deleted_at" IS NULL
        `);

        // ── 4. aplicaciones_quimicas: receta_id se va, quimico_id -> lote_quimico_id ─
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_receta_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "receta_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" RENAME COLUMN "quimico_id" TO "lote_quimico_id"`);
        await queryRunner.query(`ALTER INDEX "IDX_aq_quimico_id" RENAME TO "IDX_aq_lote_quimico_id"`);
        await queryRunner.query(`
            ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "FK_aq_lote_quimico"
                FOREIGN KEY ("lote_quimico_id") REFERENCES "lotes_quimicos"("id")
        `);

        // ── 5. aplicaciones_quimicas_detalle: quimico_id -> lote_quimico_id ─────
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" RENAME COLUMN "quimico_id" TO "lote_quimico_id"`);
        await queryRunner.query(`ALTER INDEX "IDX_aqd_quimico_id" RENAME TO "IDX_aqd_lote_quimico_id"`);
        await queryRunner.query(`
            ALTER TABLE "aplicaciones_quimicas_detalle" ADD CONSTRAINT "FK_aqd_lote_quimico"
                FOREIGN KEY ("lote_quimico_id") REFERENCES "lotes_quimicos"("id")
        `);

        // ── 6. contexto: invernadero -> greenhouse ──────────────────────────
        await queryRunner.query(`ALTER TYPE "aplicacion_contexto" RENAME VALUE 'invernadero' TO 'greenhouse'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── 6. contexto ──────────────────────────────────────────────────────
        await queryRunner.query(`ALTER TYPE "aplicacion_contexto" RENAME VALUE 'greenhouse' TO 'invernadero'`);

        // ── 5. aplicaciones_quimicas_detalle ─────────────────────────────────
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" DROP CONSTRAINT "FK_aqd_lote_quimico"`);
        await queryRunner.query(`ALTER INDEX "IDX_aqd_lote_quimico_id" RENAME TO "IDX_aqd_quimico_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas_detalle" RENAME COLUMN "lote_quimico_id" TO "quimico_id"`);

        // ── 4. aplicaciones_quimicas ─────────────────────────────────────────
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP CONSTRAINT "FK_aq_lote_quimico"`);
        await queryRunner.query(`ALTER INDEX "IDX_aq_lote_quimico_id" RENAME TO "IDX_aq_quimico_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" RENAME COLUMN "lote_quimico_id" TO "quimico_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "receta_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_receta_id" ON "aplicaciones_quimicas" ("receta_id")`);

        // ── 3. lotes_quimicos ────────────────────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_lotes_quimicos_tenant_quimico_numero"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_quimicos_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_quimicos_quimico_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_quimicos_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "lotes_quimicos"`);

        // ── 2. quimicos ──────────────────────────────────────────────────────
        await queryRunner.query(`CREATE TYPE "quimico_unidad_stock" AS ENUM ('kg', 'g', 'l', 'ml')`);
        await queryRunner.query(`
            ALTER TABLE "quimicos"
                ALTER COLUMN "unidad_medida" TYPE character varying(30)
                USING "unidad_medida"::character varying(30)
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "quimico_unidad_medida"`);

        await queryRunner.query(`ALTER TABLE "quimicos" ADD "stock_actual" numeric(10,3) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "unidad_stock" "quimico_unidad_stock" NOT NULL DEFAULT 'l'`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "nombre_lista" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "manufacture_date" date`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "dom" date`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "batch" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "proveedor_id" uuid`);
        await queryRunner.query(`
            ALTER TABLE "quimicos" ADD CONSTRAINT "FK_quimicos_proveedor"
                FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_quimicos_proveedor_id" ON "quimicos" ("proveedor_id")`);

        // ── 1. movimientos_stock ─────────────────────────────────────────────
        await queryRunner.query(`CREATE TYPE "movimiento_tipo" AS ENUM ('ingreso', 'egreso_manual')`);
        await queryRunner.query(`
            CREATE TABLE "movimientos_stock" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "quimico_id" uuid NOT NULL,
                "establecimiento_id" uuid NOT NULL,
                "tipo" "movimiento_tipo" NOT NULL,
                "cantidad" numeric(10,3) NOT NULL,
                "unidad_medida" character varying(30) NOT NULL,
                "numero_remito" character varying(100),
                "observaciones" text,
                "usuario_id" uuid NOT NULL,
                "fecha" date NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_movimientos_stock" PRIMARY KEY ("id"),
                CONSTRAINT "FK_movimientos_stock_quimico" FOREIGN KEY ("quimico_id")
                    REFERENCES "quimicos"("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_tenant_id" ON "movimientos_stock" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_quimico_id" ON "movimientos_stock" ("quimico_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_establecimiento_id" ON "movimientos_stock" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_tipo" ON "movimientos_stock" ("tipo")`);
        await queryRunner.query(`CREATE INDEX "IDX_movimientos_stock_fecha" ON "movimientos_stock" ("fecha")`);
    }
}
