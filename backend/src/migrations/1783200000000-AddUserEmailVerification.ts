import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserEmailVerification1783200000000
  implements MigrationInterface
{
  name = 'AddUserEmailVerification1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isEmailVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationToken" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationExpires" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationExpires"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationToken"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "isEmailVerified"`,
    );
  }
}
