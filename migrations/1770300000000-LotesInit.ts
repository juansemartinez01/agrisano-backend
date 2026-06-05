import { MigrationInterface, QueryRunner } from "typeorm";

export class LotesInit1770300000000 implements MigrationInterface {
    name = 'LotesInit1770300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "lote_tipo" AS ENUM ('semilla', 'sustrato')`);
        await queryRunner.query(`
            CREATE TABLE "lotes" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "tipo" "lote_tipo" NOT NULL,
                "numero_lote" character varying(100) NOT NULL,
                "proveedor" character varying(200),
                "observaciones" text,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_lotes" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_tenant_id" ON "lotes" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_tipo" ON "lotes" ("tipo")`);
        await queryRunner.query(`CREATE INDEX "IDX_lotes_activo" ON "lotes" ("activo")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_lotes_tenant_tipo_numero"
                ON "lotes" ("tenant_id", "tipo", "numero_lote")
                WHERE "deleted_at" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_lotes_tenant_tipo_numero"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_tipo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_lotes_tenant_id"`);
        await queryRunner.query(`DROP TABLE "lotes"`);
        await queryRunner.query(`DROP TYPE "lote_tipo"`);
    }

}
