import { MigrationInterface, QueryRunner } from "typeorm";

export class BandejaCarenciaHasta1772800000000 implements MigrationInterface {
    name = 'BandejaCarenciaHasta1772800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bandejas" ADD "carencia_hasta" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bandejas" DROP COLUMN "carencia_hasta"`);
    }
}
