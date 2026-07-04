import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailSyncRecords1783024563451 implements MigrationInterface {
  name = 'AddEmailSyncRecords1783024563451';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."email_sync_records_provider_enum" AS ENUM('GMAIL', 'OUTLOOK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."email_sync_records_status_enum" AS ENUM('CREATED', 'DUPLICATE', 'NOT_RELEVANT', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_sync_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" "public"."email_sync_records_provider_enum" NOT NULL, "externalMessageId" character varying NOT NULL, "status" "public"."email_sync_records_status_enum" NOT NULL, "reason" character varying(255), "attemptCount" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "application_id" uuid, CONSTRAINT "UQ_f933de41aa08eda7a10e9141134" UNIQUE ("user_id", "provider", "externalMessageId"), CONSTRAINT "PK_33ce5fe39ed84b675c9865439ed" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c144d4ea022bb4d9cff01b7fac" ON "email_sync_records"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" ADD CONSTRAINT "FK_c144d4ea022bb4d9cff01b7fac5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" ADD CONSTRAINT "FK_4893d7fbf27bc621c961c1e81ad" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" DROP CONSTRAINT "FK_4893d7fbf27bc621c961c1e81ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" DROP CONSTRAINT "FK_c144d4ea022bb4d9cff01b7fac5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c144d4ea022bb4d9cff01b7fac"`,
    );
    await queryRunner.query(`DROP TABLE "email_sync_records"`);
    await queryRunner.query(
      `DROP TYPE "public"."email_sync_records_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."email_sync_records_provider_enum"`,
    );
  }
}
