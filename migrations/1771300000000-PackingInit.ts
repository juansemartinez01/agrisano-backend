import { MigrationInterface, QueryRunner } from "typeorm";

export class PackingInit1771300000000 implements MigrationInterface {
    name = 'PackingInit1771300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: lotes_packing table (plain entity — no deleted_at, UNIQUE cosecha_id)
        await queryRunner.query(`
            CREATE TABLE "lotes_packing" (
                "id"              uuid             NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id"       uuid             NULL,
                "cosecha_id"      uuid             NOT NULL,
                "fecha_hora"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "peso_bruto_kg"   numeric(10,3)    NOT NULL,
                "usuario_id"      uuid             NOT NULL,
                "observaciones"   text             NULL,
                "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_lotes_packing" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_lotes_packing_cosecha_id" UNIQUE ("cosecha_id")
            )
        `);

        // Step 2: lotes_packing_categorias table
        await queryRunner.query(`
            CREATE TABLE "lotes_packing_categorias" (
                "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
                "lote_packing_id"     uuid          NOT NULL,
                "categoria"           varchar(10)   NOT NULL,
                "peso_kg"             numeric(10,3) NOT NULL,
                "cantidad_cajas"      integer       NOT NULL,
                "peso_neto_por_caja"  numeric(10,3) NOT NULL,
                CONSTRAINT "PK_lotes_packing_categorias" PRIMARY KEY ("id")
            )
        `);

        // Step 3: indexes for common lookup patterns
        await queryRunner.query(`CREATE INDEX "IDX_lotes_packing_tenant_id"    ON "lotes_packing" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_packing_cosecha_id"   ON "lotes_packing" ("cosecha_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_packing_cat_lp_id"    ON "lotes_packing_categorias" ("lote_packing_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_packing_cat_lp_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_packing_cosecha_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lotes_packing_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "lotes_packing_categorias"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "lotes_packing"`);
    }
}
