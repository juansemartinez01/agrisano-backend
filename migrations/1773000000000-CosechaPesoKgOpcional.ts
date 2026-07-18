import { MigrationInterface, QueryRunner } from "typeorm";

export class CosechaPesoKgOpcional1773000000000 implements MigrationInterface {
    name = 'CosechaPesoKgOpcional1773000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cosechas" ALTER COLUMN "peso_kg" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Backfill any NULLs before reinstating NOT NULL, otherwise this fails
        // on rows created after this migration ran with no peso_kg.
        await queryRunner.query(`UPDATE "cosechas" SET "peso_kg" = 0 WHERE "peso_kg" IS NULL`);
        await queryRunner.query(`ALTER TABLE "cosechas" ALTER COLUMN "peso_kg" SET NOT NULL`);
    }

}
