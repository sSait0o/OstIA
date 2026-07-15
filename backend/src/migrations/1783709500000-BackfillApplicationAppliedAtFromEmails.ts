import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillApplicationAppliedAtFromEmails1783709500000 implements MigrationInterface {
  name = 'BackfillApplicationAppliedAtFromEmails1783709500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "applications" a
      SET "appliedAt" = e."firstReceivedAt"
      FROM (
        SELECT application_id, MIN("receivedAt") AS "firstReceivedAt"
        FROM "application_emails"
        WHERE "receivedAt" IS NOT NULL
        GROUP BY application_id
      ) e
      WHERE a.id = e.application_id AND a."appliedAt" IS NULL
    `);
  }

  public async down(): Promise<void> {}
}
