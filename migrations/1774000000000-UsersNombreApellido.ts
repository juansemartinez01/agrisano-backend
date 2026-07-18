import { MigrationInterface, QueryRunner } from "typeorm";

export class UsersNombreApellido1774000000000 implements MigrationInterface {
    name = 'UsersNombreApellido1774000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "nombre" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "apellido" varchar(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "apellido"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "nombre"`);
    }

}
