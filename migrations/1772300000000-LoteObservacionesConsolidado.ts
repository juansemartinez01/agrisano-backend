import { MigrationInterface, QueryRunner } from "typeorm";

export class LoteObservacionesConsolidado1772300000000 implements MigrationInterface {
    name = 'LoteObservacionesConsolidado1772300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Backfill: si observaciones está vacía, tomar observations tal cual;
        // si ambas tienen datos, concatenar para no perder información.
        await queryRunner.query(`
            UPDATE "lotes"
            SET "observaciones" = CASE
                WHEN "observaciones" IS NULL OR "observaciones" = '' THEN "observations"
                WHEN "observations" IS NULL OR "observations" = '' THEN "observaciones"
                ELSE "observaciones" || ' | ' || "observations"
            END
            WHERE "observations" IS NOT NULL AND "observations" != ''
        `);

        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "observations"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lotes" ADD "observations" text`);
    }
}
