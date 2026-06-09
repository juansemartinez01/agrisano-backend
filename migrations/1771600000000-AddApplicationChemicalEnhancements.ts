import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApplicationChemicalEnhancements1771600000000 implements MigrationInterface {
    name = 'AddApplicationChemicalEnhancements1771600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add carencia_hasta to mesas
        await queryRunner.query(`ALTER TABLE "mesas" ADD "carencia_hasta" date`);

        // Add primary chemical fields to aplicaciones_quimicas
        // Note: quimico_rate_unidad enum type exists from migration 1771500000000-AddChemicalFields
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "quimico_id" uuid`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "dosis" numeric(10,3)`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "dosis_unidad" "quimico_rate_unidad"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "batch" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "withholding_period_dias" integer`);

        // Extend historial_tipo_evento enum with en_carencia value
        await queryRunner.query(`ALTER TYPE "historial_tipo_evento" ADD VALUE IF NOT EXISTS 'en_carencia'`);

        // Index for looking up applications by quimico
        await queryRunner.query(`CREATE INDEX "IDX_aq_quimico_id" ON "aplicaciones_quimicas" ("quimico_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_quimico_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "withholding_period_dias"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "batch"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "dosis_unidad"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "dosis"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "quimico_id"`);
        await queryRunner.query(`ALTER TABLE "mesas" DROP COLUMN "carencia_hasta"`);
        // Note: ALTER TYPE ... DROP VALUE is not supported in PostgreSQL — en_carencia stays in the enum type
    }

}
