import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobsUniqueExternalId1783709300003 implements MigrationInterface {
  name = 'AddJobsUniqueExternalId1783709300003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "jobs" j
      USING "jobs" j2
      WHERE j."externalId" IS NOT NULL
        AND j."externalId" = j2."externalId"
        AND j."user_id" = j2."user_id"
        AND j.id < j2.id
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_jobs_user_externalId" ON "jobs" ("user_id", "externalId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_jobs_user_externalId"`);
  }
}
