import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSeedLotFields1771400000000 implements MigrationInterface {
    name = 'AddSeedLotFields1771400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "lote_producto" AS ENUM ('lechuga', 'espinaca', 'rucula')`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "producto" "lote_producto"`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "variedad" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "batch" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "seed_company" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "supplier" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "lotes" ADD "observations" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "observations"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "supplier"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "seed_company"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "batch"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "variedad"`);
        await queryRunner.query(`ALTER TABLE "lotes" DROP COLUMN "producto"`);
        await queryRunner.query(`DROP TYPE "lote_producto"`);
    }

}
