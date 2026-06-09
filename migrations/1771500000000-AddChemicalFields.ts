import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChemicalFields1771500000000 implements MigrationInterface {
    name = 'AddChemicalFields1771500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "quimico_unidad_stock" AS ENUM ('kg', 'g', 'l', 'ml')`);
        await queryRunner.query(`CREATE TYPE "quimico_rate_unidad" AS ENUM ('kg/l', 'g/l', 'ml/l', 'l/l')`);

        await queryRunner.query(`ALTER TABLE "quimicos" ADD "nombre_lista" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "unidad_stock" "quimico_unidad_stock" NOT NULL DEFAULT 'l'`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "rate_unidad" "quimico_rate_unidad" NOT NULL DEFAULT 'ml/l'`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "withholding_period_dias" integer`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "manufacture_date" date`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "dom" date`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "supplier" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "quimicos" ADD "batch" character varying(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "batch"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "supplier"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "dom"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "manufacture_date"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "withholding_period_dias"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "rate_unidad"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "unidad_stock"`);
        await queryRunner.query(`ALTER TABLE "quimicos" DROP COLUMN "nombre_lista"`);
        await queryRunner.query(`DROP TYPE "quimico_rate_unidad"`);
        await queryRunner.query(`DROP TYPE "quimico_unidad_stock"`);
    }

}
