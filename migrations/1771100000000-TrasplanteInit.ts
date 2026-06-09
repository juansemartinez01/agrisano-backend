import { MigrationInterface, QueryRunner } from "typeorm";

export class TrasplanteInit1771100000000 implements MigrationInterface {
    name = 'TrasplanteInit1771100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: mesa_bandeja join table (composite PK — no extra id column)
        await queryRunner.query(`
            CREATE TABLE "mesa_bandeja" (
                "mesa_id" uuid NOT NULL,
                "bandeja_id" uuid NOT NULL,
                "fecha_trasplante" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_mesa_bandeja" PRIMARY KEY ("mesa_id", "bandeja_id"),
                CONSTRAINT "FK_mesa_bandeja_mesa" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id"),
                CONSTRAINT "FK_mesa_bandeja_bandeja" FOREIGN KEY ("bandeja_id") REFERENCES "bandejas"("id")
            )
        `);

        // Step 2: indexes for common lookup patterns
        await queryRunner.query(`CREATE INDEX "IDX_mb_mesa_id" ON "mesa_bandeja" ("mesa_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_mb_bandeja_id" ON "mesa_bandeja" ("bandeja_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mb_bandeja_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mb_mesa_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "mesa_bandeja"`);
    }
}
