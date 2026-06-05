import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoInit1769986178145 implements MigrationInterface {
    name = 'AutoInit1769986178145'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "app_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "key" character varying(80) NOT NULL, "value" text NOT NULL, CONSTRAINT "PK_4800b266ba790931744b3e53a74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_975c2db59c65c05fd9c6b63a2a" ON "app_settings" ("key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_975c2db59c65c05fd9c6b63a2a"`);
        await queryRunner.query(`DROP TABLE "app_settings"`);
    }

}
