import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenEncryptedColumnTypes1783709600000 implements MigrationInterface {
  name = 'WidenEncryptedColumnTypes1783709600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "company" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "jobTitle" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "location" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "emailSubject" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_connections" ALTER COLUMN "email" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_emails" ALTER COLUMN "subject" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_emails" ALTER COLUMN "subject" TYPE character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_connections" ALTER COLUMN "email" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "emailSubject" TYPE character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "location" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "jobTitle" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "company" TYPE character varying`,
    );
  }
}
