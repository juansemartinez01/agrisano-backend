import { MigrationInterface, QueryRunner } from "typeorm";

// Snapshot del responsable (email/nombre/apellido) al momento de crear el
// registro, para auditoría histórica: no se re-escribe si el usuario cambia
// de nombre o es desactivado/borrado después. Mismo shape en las 6 tablas.
// Sin backfill: filas históricas quedan con snapshot NULL a propósito
// (se resuelven en runtime vía join en vivo contra `users`).
export class AddUsuarioSnapshotColumns1774200000000 implements MigrationInterface {
    name = 'AddUsuarioSnapshotColumns1774200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const tables = ['siembras', 'cosechas', 'lotes_packing', 'historial_mesa', 'aplicaciones_quimicas'];
        for (const table of tables) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD "usuario_email_snapshot" varchar(150)`);
            await queryRunner.query(`ALTER TABLE "${table}" ADD "usuario_nombre_snapshot" varchar(100)`);
            await queryRunner.query(`ALTER TABLE "${table}" ADD "usuario_apellido_snapshot" varchar(100)`);
        }

        // mesa_bandeja (trasplante) nunca tuvo usuario_id: se agrega junto con
        // el snapshot. Filas históricas quedan con usuario_id/snapshot NULL.
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" ADD "usuario_id" uuid`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" ADD "usuario_email_snapshot" varchar(150)`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" ADD "usuario_nombre_snapshot" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" ADD "usuario_apellido_snapshot" varchar(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" DROP COLUMN "usuario_apellido_snapshot"`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" DROP COLUMN "usuario_nombre_snapshot"`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" DROP COLUMN "usuario_email_snapshot"`);
        await queryRunner.query(`ALTER TABLE "mesa_bandeja" DROP COLUMN "usuario_id"`);

        const tables = ['siembras', 'cosechas', 'lotes_packing', 'historial_mesa', 'aplicaciones_quimicas'];
        for (const table of tables.slice().reverse()) {
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "usuario_apellido_snapshot"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "usuario_nombre_snapshot"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "usuario_email_snapshot"`);
        }
    }

}
