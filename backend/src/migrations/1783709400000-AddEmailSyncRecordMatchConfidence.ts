import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailSyncRecordMatchConfidence1783709400000
  implements MigrationInterface
{
  name = 'AddEmailSyncRecordMatchConfidence1783709400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" ADD "matchConfidence" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_sync_records" DROP COLUMN "matchConfidence"`,
    );
  }
}
