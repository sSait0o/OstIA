import { MigrationInterface, QueryRunner } from 'typeorm';

export class TightenUserEmailHashConstraint1783709300002 implements MigrationInterface {
  name = 'TightenUserEmailHashConstraint1783709300002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        old_constraint text;
      BEGIN
        SELECT tc.constraint_name INTO old_constraint
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'users'
          AND tc.constraint_type = 'UNIQUE'
          AND ccu.column_name = 'email';

        IF old_constraint IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "users" DROP CONSTRAINT %I', old_constraint);
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "emailHash" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_emailHash" ON "users" ("emailHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_emailHash"`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "emailHash" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")`,
    );
  }
}
