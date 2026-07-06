import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationEmails1783272626526 implements MigrationInterface {
  name = 'AddApplicationEmails1783272626526';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."application_emails_provider_enum" AS ENUM('GMAIL', 'OUTLOOK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."application_emails_statusdetected_enum" AS ENUM('APPLIED', 'ACKNOWLEDGED', 'INTERVIEW', 'TECHNICAL', 'OFFER', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "application_emails" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" "public"."application_emails_provider_enum" NOT NULL, "externalMessageId" character varying NOT NULL, "subject" character varying(500), "body" text, "statusDetected" "public"."application_emails_statusdetected_enum", "receivedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "application_id" uuid, CONSTRAINT "UQ_c4e6e5859d1fa5f2dc7c77125fd" UNIQUE ("application_id", "provider", "externalMessageId"), CONSTRAINT "PK_d384b5f74426ffc0939b2cd7431" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1fb7abc0c360c7af58542636b5" ON "application_emails"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a32b4987dec36b0b0baa5f269" ON "application_emails"  ("application_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "application_emails" ADD CONSTRAINT "FK_1fb7abc0c360c7af58542636b55" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_emails" ADD CONSTRAINT "FK_0a32b4987dec36b0b0baa5f2698" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_emails" DROP CONSTRAINT "FK_0a32b4987dec36b0b0baa5f2698"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_emails" DROP CONSTRAINT "FK_1fb7abc0c360c7af58542636b55"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0a32b4987dec36b0b0baa5f269"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1fb7abc0c360c7af58542636b5"`,
    );
    await queryRunner.query(`DROP TABLE "application_emails"`);
    await queryRunner.query(
      `DROP TYPE "public"."application_emails_statusdetected_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."application_emails_provider_enum"`,
    );
  }
}
