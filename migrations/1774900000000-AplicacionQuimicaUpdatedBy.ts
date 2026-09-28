import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshot de quién hizo la última corrección (PATCH) de una aplicación
// química, separado del usuario_* que registra la creación original.
// Todas nullable: la mayoría de las filas nunca se editan.
export class AplicacionQuimicaUpdatedBy1774900000000
  implements MigrationInterface
{
  name = 'AplicacionQuimicaUpdatedBy1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "updated_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "updated_by_email_snapshot" varchar(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "updated_by_nombre_snapshot" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" ADD "updated_by_apellido_snapshot" varchar(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "updated_by_apellido_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "updated_by_nombre_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "updated_by_email_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "updated_by"`,
    );
  }
}
