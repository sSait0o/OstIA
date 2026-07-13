import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailConnectionSyncAttemptCount1783300000000 implements MigrationInterface {
  name = 'AddEmailConnectionSyncAttemptCount1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_connections" ADD "syncAttemptCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_connections" DROP COLUMN "syncAttemptCount"`,
    );
  }
}
