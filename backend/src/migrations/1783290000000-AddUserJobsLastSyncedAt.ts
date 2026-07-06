import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserJobsLastSyncedAt1783290000000 implements MigrationInterface {
  name = 'AddUserJobsLastSyncedAt1783290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "jobsLastSyncedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "jobsLastSyncedAt"`,
    );
  }
}
