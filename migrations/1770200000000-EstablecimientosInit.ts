import { MigrationInterface, QueryRunner } from "typeorm";

export class EstablecimientosInit1770200000000 implements MigrationInterface {
    name = 'EstablecimientosInit1770200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "establecimientos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tenant_id" uuid,
                "nombre" character varying(150) NOT NULL,
                "ubicacion" character varying(300),
                "activo" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_establecimientos" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_establecimientos_tenant_id" ON "establecimientos" ("tenant_id")`);
        await queryRunner.query(`
            CREATE TABLE "usuario_establecimiento" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "user_id" uuid NOT NULL,
                "establecimiento_id" uuid NOT NULL,
                "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_ue_user_establecimiento" UNIQUE ("user_id", "establecimiento_id"),
                CONSTRAINT "FK_ue_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ue_establecimiento" FOREIGN KEY ("establecimiento_id")
                    REFERENCES "establecimientos"("id") ON DELETE CASCADE,
                CONSTRAINT "PK_usuario_establecimiento" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_ue_user_id" ON "usuario_establecimiento" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_ue_establecimiento_id" ON "usuario_establecimiento" ("establecimiento_id")`);
        await queryRunner.query(`
            INSERT INTO "roles" ("id", "tenant_id", "name", "created_at", "updated_at")
            VALUES
                (gen_random_uuid(), NULL, 'operario',     now(), now()),
                (gen_random_uuid(), NULL, 'supervisor',   now(), now()),
                (gen_random_uuid(), NULL, 'admin_global', now(), now())
            ON CONFLICT ("name") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_ue_establecimiento_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ue_user_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "usuario_establecimiento"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_establecimientos_tenant_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "establecimientos"`);
    }

}
