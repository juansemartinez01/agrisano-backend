import { MigrationInterface, QueryRunner } from "typeorm";

export class TunelesInit1770800000000 implements MigrationInterface {
    name = 'TunelesInit1770800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "tuneles" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "nombre" character varying(100) NOT NULL,
                "capacidad_maxima" integer NOT NULL,
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_tuneles" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_tuneles_tenant_id" ON "tuneles" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_tuneles_establecimiento_id" ON "tuneles" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_tuneles_activo" ON "tuneles" ("activo")`);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_tuneles_tenant_est_nombre"
                ON "tuneles" ("tenant_id", "establecimiento_id", "nombre")
                WHERE "deleted_at" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_tuneles_tenant_est_nombre"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tuneles_activo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tuneles_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tuneles_tenant_id"`);
        await queryRunner.query(`DROP TABLE "tuneles"`);
    }

}
