import { MigrationInterface, QueryRunner } from "typeorm";

export class CosechaInit1771200000000 implements MigrationInterface {
    name = 'CosechaInit1771200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: cosechas table (plain entity — no deleted_at)
        await queryRunner.query(`
            CREATE TABLE "cosechas" (
                "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id"           uuid          NULL,
                "mesa_id"             uuid          NOT NULL,
                "tunel_id"            uuid          NOT NULL,
                "posicion_al_momento" integer       NOT NULL DEFAULT 1,
                "fecha_hora"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "peso_kg"             numeric(10,3) NOT NULL,
                "usuario_id"          uuid          NOT NULL,
                "observaciones"       text          NULL,
                "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cosechas" PRIMARY KEY ("id")
            )
        `);

        // Step 2: indexes for common lookup patterns
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_tenant_id"  ON "cosechas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_mesa_id"    ON "cosechas" ("mesa_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_tunel_id"   ON "cosechas" ("tunel_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_cosechas_fecha_hora" ON "cosechas" ("fecha_hora")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_fecha_hora"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_tunel_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_mesa_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cosechas_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "cosechas"`);
    }
}
