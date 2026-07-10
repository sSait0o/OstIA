import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncryptionColumns1783709300000 implements MigrationInterface {
  name = 'AddEncryptionColumns1783709300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailHash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "cvData" TYPE text USING "cvData"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "firstName" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "lastName" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "lastName" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "firstName" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "cvData" TYPE jsonb USING "cvData"::jsonb`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailHash"`);
  }
}
