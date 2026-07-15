import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveApplicationLastContactAt1783708299396 implements MigrationInterface {
  name = 'RemoveApplicationLastContactAt1783708299396';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" DROP COLUMN "lastContactAt"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "lastContactAt" TIMESTAMP`,
    );
  }
}
