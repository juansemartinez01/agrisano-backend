import { MigrationInterface, QueryRunner } from "typeorm";

export class SiembraInit1770400000000 implements MigrationInterface {
    name = 'SiembraInit1770400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "bandeja_estado" AS ENUM ('en_nursery', 'trasplantada')`);

        await queryRunner.query(`
            CREATE TABLE "siembras" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "establecimiento_id" uuid NOT NULL,
                "fecha" date NOT NULL,
                "observaciones" text,
                "usuario_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_siembras" PRIMARY KEY ("id"),
                CONSTRAINT "FK_siembras_establecimiento" FOREIGN KEY ("establecimiento_id")
                    REFERENCES "establecimientos"("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "bandejas" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "siembra_id" uuid NOT NULL,
                "lote_semilla_id" uuid NOT NULL,
                "lote_sustrato_id" uuid NOT NULL,
                "estado" "bandeja_estado" NOT NULL DEFAULT 'en_nursery',
                "fecha_entrada_nursery" TIMESTAMP WITH TIME ZONE NOT NULL,
                "fecha_trasplante" TIMESTAMP WITH TIME ZONE,
                "mesa_id" uuid,
                "observaciones" text,
                "codigo" character varying(100),
                "establecimiento_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_bandejas" PRIMARY KEY ("id"),
                CONSTRAINT "FK_bandejas_siembra" FOREIGN KEY ("siembra_id")
                    REFERENCES "siembras"("id"),
                CONSTRAINT "FK_bandejas_lote_semilla" FOREIGN KEY ("lote_semilla_id")
                    REFERENCES "lotes"("id"),
                CONSTRAINT "FK_bandejas_lote_sustrato" FOREIGN KEY ("lote_sustrato_id")
                    REFERENCES "lotes"("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_siembras_tenant_id" ON "siembras" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_siembras_establecimiento_id" ON "siembras" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_siembras_fecha" ON "siembras" ("fecha")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_tenant_id" ON "bandejas" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_siembra_id" ON "bandejas" ("siembra_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_establecimiento_id" ON "bandejas" ("establecimiento_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_estado" ON "bandejas" ("estado")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_lote_semilla_id" ON "bandejas" ("lote_semilla_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_bandejas_lote_sustrato_id" ON "bandejas" ("lote_sustrato_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_lote_sustrato_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_lote_semilla_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_estado"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_siembra_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bandejas_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_siembras_fecha"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_siembras_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_siembras_tenant_id"`);
        await queryRunner.query(`DROP TABLE "bandejas"`);
        await queryRunner.query(`DROP TABLE "siembras"`);
        await queryRunner.query(`DROP TYPE "bandeja_estado"`);
    }

}
