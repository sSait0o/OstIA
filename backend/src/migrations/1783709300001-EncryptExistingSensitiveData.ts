import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  decryptString,
  encryptString,
  hmacEmail,
  isEncrypted,
} from '../common/crypto.util';

const BATCH_SIZE = 500;

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cvData: string | null;
}

interface ApplicationRow {
  id: string;
  emailBody: string | null;
  notes: string | null;
}

export class EncryptExistingSensitiveData1783709300001 implements MigrationInterface {
  name = 'EncryptExistingSensitiveData1783709300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.forEachBatch<UserRow>(
      queryRunner,
      `SELECT id, email, "firstName", "lastName", "cvData" FROM "users" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        if (isEncrypted(row.email)) return;
        const emailHash = hmacEmail(row.email);
        const encEmail = encryptString(row.email);
        const encFirstName = encryptString(row.firstName);
        const encLastName = encryptString(row.lastName);
        const encCvData =
          row.cvData != null && !isEncrypted(row.cvData)
            ? encryptString(row.cvData)
            : row.cvData;

        await queryRunner.query(
          `UPDATE "users" SET email = $1, "emailHash" = $2, "firstName" = $3, "lastName" = $4, "cvData" = $5 WHERE id = $6`,
          [encEmail, emailHash, encFirstName, encLastName, encCvData, row.id],
        );
      },
    );

    await this.forEachBatch<ApplicationRow>(
      queryRunner,
      `SELECT id, "emailBody", notes FROM "applications" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const encEmailBody =
          row.emailBody != null && !isEncrypted(row.emailBody)
            ? encryptString(row.emailBody)
            : row.emailBody;
        const encNotes =
          row.notes != null && !isEncrypted(row.notes)
            ? encryptString(row.notes)
            : row.notes;
        if (encEmailBody === row.emailBody && encNotes === row.notes) return;

        await queryRunner.query(
          `UPDATE "applications" SET "emailBody" = $1, notes = $2 WHERE id = $3`,
          [encEmailBody, encNotes, row.id],
        );
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.forEachBatch<UserRow>(
      queryRunner,
      `SELECT id, email, "firstName", "lastName", "cvData" FROM "users" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        if (!isEncrypted(row.email)) return;
        const plainEmail = decryptString(row.email);
        const plainFirstName = decryptString(row.firstName);
        const plainLastName = decryptString(row.lastName);
        const plainCvData =
          row.cvData != null && isEncrypted(row.cvData)
            ? decryptString(row.cvData)
            : row.cvData;

        await queryRunner.query(
          `UPDATE "users" SET email = $1, "emailHash" = NULL, "firstName" = $2, "lastName" = $3, "cvData" = $4 WHERE id = $5`,
          [plainEmail, plainFirstName, plainLastName, plainCvData, row.id],
        );
      },
    );

    await this.forEachBatch<ApplicationRow>(
      queryRunner,
      `SELECT id, "emailBody", notes FROM "applications" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const plainEmailBody =
          row.emailBody != null && isEncrypted(row.emailBody)
            ? decryptString(row.emailBody)
            : row.emailBody;
        const plainNotes =
          row.notes != null && isEncrypted(row.notes)
            ? decryptString(row.notes)
            : row.notes;
        if (plainEmailBody === row.emailBody && plainNotes === row.notes)
          return;

        await queryRunner.query(
          `UPDATE "applications" SET "emailBody" = $1, notes = $2 WHERE id = $3`,
          [plainEmailBody, plainNotes, row.id],
        );
      },
    );
  }

  private async forEachBatch<T>(
    queryRunner: QueryRunner,
    selectQuery: string,
    handler: (row: T) => Promise<void>,
  ): Promise<void> {
    let offset = 0;
    for (;;) {
      const rows = (await queryRunner.query(selectQuery, [offset])) as T[];
      if (rows.length === 0) break;
      for (const row of rows) {
        await handler(row);
      }
      if (rows.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  }
}
