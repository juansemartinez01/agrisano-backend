import { MigrationInterface, QueryRunner } from "typeorm";

// Agrega las cuatro unidades de dosis por superficie al enum compartido
// "quimico_rate_unidad", usado por tres columnas: quimicos.rate_unidad,
// aplicaciones_quimicas.dosis_unidad y aplicaciones_quimicas_detalle.dosis_unidad.
// Un ALTER TYPE las habilita en las tres — es el comportamiento buscado:
// rate_unidad es el default de dosis_unidad, así que un químico dosificado por
// hectárea necesita poder configurarlo en el catálogo.
// A diferencia de 1774500000000, las cuatro sentencias van en la misma
// migración: ninguna las usa (sin backfill, sin CHECK, sin DEFAULT nuevo), que
// es la única restricción de Postgres al agregar valores dentro de una
// transacción.
export class RateUnidadHectarea1774600000000 implements MigrationInterface {
    name = 'RateUnidadHectarea1774600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" ADD VALUE 'mL/Ha'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" ADD VALUE 'L/Ha'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" ADD VALUE 'g/Ha'`);
        await queryRunner.query(`ALTER TYPE "quimico_rate_unidad" ADD VALUE 'kg/Ha'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres no permite DROP VALUE en un enum — los cuatro valores quedan
        // en el tipo (misma limitación ya documentada en 1772200000000 y
        // 1774500000000). Mientras ninguna fila los use, son inertes.
    }
}
