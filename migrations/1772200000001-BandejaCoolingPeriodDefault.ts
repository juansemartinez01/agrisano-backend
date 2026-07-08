import { MigrationInterface, QueryRunner } from "typeorm";

export class BandejaCoolingPeriodDefault1772200000001 implements MigrationInterface {
    name = 'BandejaCoolingPeriodDefault1772200000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "estado" SET DEFAULT 'cooling_period'`);
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "fecha_entrada_nursery" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "bandejas" SET "fecha_entrada_nursery" = now() WHERE "fecha_entrada_nursery" IS NULL`);
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "fecha_entrada_nursery" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "estado" SET DEFAULT 'en_nursery'`);
    }
}
