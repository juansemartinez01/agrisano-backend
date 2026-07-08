import { MigrationInterface, QueryRunner } from "typeorm";

export class BandejaCodigoObservaciones1772400000000 implements MigrationInterface {
    name = 'BandejaCodigoObservaciones1772400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // codigo: nunca se seteaba desde el código — backfillear las filas existentes
        // antes de exigir NOT NULL + UNIQUE
        await queryRunner.query(`UPDATE "bandejas" SET "codigo" = gen_random_uuid()::text WHERE "codigo" IS NULL`);
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "codigo" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bandejas" ADD CONSTRAINT "UQ_bandejas_codigo" UNIQUE ("codigo")`);

        // observaciones: columna muerta, ningún endpoint la seteaba jamás
        await queryRunner.query(`ALTER TABLE "bandejas" DROP COLUMN "observaciones"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bandejas" ADD "observaciones" text`);

        await queryRunner.query(`ALTER TABLE "bandejas" DROP CONSTRAINT "UQ_bandejas_codigo"`);
        await queryRunner.query(`ALTER TABLE "bandejas" ALTER COLUMN "codigo" DROP NOT NULL`);
    }
}
