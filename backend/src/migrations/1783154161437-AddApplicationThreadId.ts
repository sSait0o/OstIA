import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApplicationThreadId1783154161437 implements MigrationInterface {
    name = 'AddApplicationThreadId1783154161437'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "applications" ADD "threadId" character varying`);
        await queryRunner.query(`CREATE INDEX "IDX_a2578e357b0f92c86b0e4e6ea1" ON "applications" ("threadId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_a2578e357b0f92c86b0e4e6ea1"`);
        await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN "threadId"`);
    }

}
