import { MigrationInterface, QueryRunner } from "typeorm";

// quimico_rate_unidad es compartido por quimicos.rate_unidad y
// aplicaciones_quimicas.dosis_unidad — este rename afecta a ambas columnas.
export class RateUnidadUppercaseL1772600000000 implements MigrationInterface {
    name = 'RateUnidadUppercaseL1772600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'kg/l' TO 'kg/L'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'g/l' TO 'g/L'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'ml/l' TO 'mL/L'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'l/l' TO 'L/L'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'kg/L' TO 'kg/l'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'g/L' TO 'g/l'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'mL/L' TO 'ml/l'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" RENAME VALUE 'L/L' TO 'l/l'`);
    }
}
