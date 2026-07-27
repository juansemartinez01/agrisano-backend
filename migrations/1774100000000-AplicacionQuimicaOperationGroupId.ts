import { MigrationInterface, QueryRunner } from "typeorm";

export class AplicacionQuimicaOperationGroupId1774100000000 implements MigrationInterface {
    name = 'AplicacionQuimicaOperationGroupId1774100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" ADD "operation_group_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_aq_tenant_operation_group_id" ON "aplicaciones_quimicas" ("tenant_id", "operation_group_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aq_tenant_operation_group_id"`);
        await queryRunner.query(`ALTER TABLE "aplicaciones_quimicas" DROP COLUMN "operation_group_id"`);
    }

}
