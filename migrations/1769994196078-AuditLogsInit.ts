import { MigrationInterface, QueryRunner } from "typeorm";

export class AuditLogsInit1769994196078 implements MigrationInterface {
    name = 'AuditLogsInit1769994196078'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "tenant_id" uuid, "kind" character varying(50) NOT NULL, "request_id" character varying(60) NOT NULL, "method" character varying(10), "path" character varying(300), "status_code" integer, "action" character varying(80), "entity" character varying(60), "target_user_id" uuid, "target_role_id" uuid, "actor_user_id" uuid, "actor_email" character varying(150), "payload" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6f18d459490bb48923b1f40bdb" ON "audit_logs" ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_760923c0f409cdaef37c0a173e" ON "audit_logs" ("kind") `);
        await queryRunner.query(`CREATE INDEX "IDX_959054ba1c3ad6190ce3f7c754" ON "audit_logs" ("request_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f160d97a931844109de9d04228" ON "audit_logs" ("actor_user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f160d97a931844109de9d04228"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_959054ba1c3ad6190ce3f7c754"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_760923c0f409cdaef37c0a173e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6f18d459490bb48923b1f40bdb"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
