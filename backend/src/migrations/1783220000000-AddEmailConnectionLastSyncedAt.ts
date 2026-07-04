import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailConnectionLastSyncedAt1783220000000
  implements MigrationInterface
{
  name = 'AddEmailConnectionLastSyncedAt1783220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_connections" ADD "lastSyncedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_connections" DROP COLUMN "lastSyncedAt"`,
    );
  }
}
