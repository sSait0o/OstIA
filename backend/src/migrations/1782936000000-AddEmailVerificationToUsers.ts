import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationToUsers1782936000000 implements MigrationInterface {
  name = 'AddEmailVerificationToUsers1782936000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isEmailVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationTokenHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationTokenExpiresAt" TIMESTAMP`,
    );
    await queryRunner.query(`UPDATE "users" SET "isEmailVerified" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationTokenExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationTokenHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "isEmailVerified"`,
    );
  }
}
