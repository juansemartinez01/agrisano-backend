import { MigrationInterface, QueryRunner } from "typeorm";

export class AplicacionesQuimicasInit1771000000000 implements MigrationInterface {
    name = 'AplicacionesQuimicasInit1771000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: ENUM type
        await queryRunner.query(`CREATE TYPE "aplicacion_contexto" AS ENUM ('nursery', 'invernadero')`);

        // Step 2: aplicaciones_quimicas table (no deleted_at — immutable)
        await queryRunner.query(`
            CREATE TABLE "aplicaciones_quimicas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "contexto" "aplicacion_contexto" NOT NULL,
                "receta_id" uuid,
                "observaciones" text,
                "usuario_id" uuid NOT NULL,
                "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aplicaciones_quimicas" PRIMARY KEY ("id")
            )
        `);

        // Step 3: aplicaciones_quimicas_detalle table
        await queryRunner.query(`
            CREATE TABLE "aplicaciones_quimicas_detalle" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "aplicacion_id" uuid NOT NULL,
                "quimico_id" uuid NOT NULL,
                "cantidad" numeric(10,3) NOT NULL,
                "unidad_medida" character varying(30) NOT NULL,
                CONSTRAINT "PK_aplicaciones_quimicas_detalle" PRIMARY KEY ("id")
            )
        `);

        // Step 4: aplicacion_quimica_bandeja join table (nursery context)
        await queryRunner.query(`
            CREATE TABLE "aplicacion_quimica_bandeja" (
                "aplicacion_id" uuid NOT NULL,
                "bandeja_id" uuid NOT NULL,
                CONSTRAINT "PK_aplicacion_quimica_bandeja" PRIMARY KEY ("aplicacion_id", "bandeja_id")
            )
        `);

        // Step 5: aplicacion_quimica_mesa join table (invernadero context)
        await queryRunner.query(`
            CREATE TABLE "aplicacion_quimica_mesa" (
                "aplicacion_id" uuid NOT NULL,
                "mesa_id" uuid NOT NULL,
                CONSTRAINT "PK_aplicacion_quimica_mesa" PRIMARY KEY ("aplicacion_id", "mesa_id")
            )
        `);

        // Step 6: aplicaciones_quimicas indexes
        await queryRunner.query(`CREATE INDEX "IDX_aq_tenant_id" ON "aplicaciones_quimicas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_establecimiento_id" ON "aplicaciones_quimicas" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_contexto" ON "aplicaciones_quimicas" ("contexto")`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_fecha_hora" ON "aplicaciones_quimicas" ("fecha_hora" DESC)`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_receta_id" ON "aplicaciones_quimicas" ("receta_id")`);

        // Step 7: detalle indexes
        await queryRunner.query(`CREATE INDEX "IDX_aqd_aplicacion_id" ON "aplicaciones_quimicas_detalle" ("aplicacion_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_aqd_quimico_id" ON "aplicaciones_quimicas_detalle" ("quimico_id")`);

        // Step 8: join table indexes for reverse lookups
        await queryRunner.query(`CREATE INDEX "IDX_aqb_bandeja_id" ON "aplicacion_quimica_bandeja" ("bandeja_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_aqm_mesa_id" ON "aplicacion_quimica_mesa" ("mesa_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aqm_mesa_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aqb_bandeja_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aqd_quimico_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aqd_aplicacion_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_receta_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_fecha_hora"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_contexto"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "aplicacion_quimica_mesa"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "aplicacion_quimica_bandeja"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "aplicaciones_quimicas_detalle"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "aplicaciones_quimicas"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "aplicacion_contexto"`);
    }
}
