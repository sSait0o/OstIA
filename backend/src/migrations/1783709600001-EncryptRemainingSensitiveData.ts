import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  decryptString,
  encryptString,
  isEncrypted,
} from '../common/crypto.util';

const BATCH_SIZE = 500;

interface ApplicationRow {
  id: string;
  company: string;
  jobTitle: string;
  location: string | null;
  emailSubject: string | null;
}

interface EmailConnectionRow {
  id: string;
  email: string;
}

interface ApplicationEmailRow {
  id: string;
  subject: string | null;
  body: string | null;
}

export class EncryptRemainingSensitiveData1783709600001 implements MigrationInterface {
  name = 'EncryptRemainingSensitiveData1783709600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.forEachBatch<ApplicationRow>(
      queryRunner,
      `SELECT id, company, "jobTitle", location, "emailSubject" FROM "applications" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const encCompany = isEncrypted(row.company)
          ? row.company
          : encryptString(row.company);
        const encJobTitle = isEncrypted(row.jobTitle)
          ? row.jobTitle
          : encryptString(row.jobTitle);
        const encLocation =
          row.location != null && !isEncrypted(row.location)
            ? encryptString(row.location)
            : row.location;
        const encEmailSubject =
          row.emailSubject != null && !isEncrypted(row.emailSubject)
            ? encryptString(row.emailSubject)
            : row.emailSubject;
        if (
          encCompany === row.company &&
          encJobTitle === row.jobTitle &&
          encLocation === row.location &&
          encEmailSubject === row.emailSubject
        )
          return;

        await queryRunner.query(
          `UPDATE "applications" SET company = $1, "jobTitle" = $2, location = $3, "emailSubject" = $4 WHERE id = $5`,
          [encCompany, encJobTitle, encLocation, encEmailSubject, row.id],
        );
      },
    );

    await this.forEachBatch<EmailConnectionRow>(
      queryRunner,
      `SELECT id, email FROM "email_connections" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        if (isEncrypted(row.email)) return;
        await queryRunner.query(
          `UPDATE "email_connections" SET email = $1 WHERE id = $2`,
          [encryptString(row.email), row.id],
        );
      },
    );

    await this.forEachBatch<ApplicationEmailRow>(
      queryRunner,
      `SELECT id, subject, body FROM "application_emails" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const encSubject =
          row.subject != null && !isEncrypted(row.subject)
            ? encryptString(row.subject)
            : row.subject;
        const encBody =
          row.body != null && !isEncrypted(row.body)
            ? encryptString(row.body)
            : row.body;
        if (encSubject === row.subject && encBody === row.body) return;

        await queryRunner.query(
          `UPDATE "application_emails" SET subject = $1, body = $2 WHERE id = $3`,
          [encSubject, encBody, row.id],
        );
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.forEachBatch<ApplicationRow>(
      queryRunner,
      `SELECT id, company, "jobTitle", location, "emailSubject" FROM "applications" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const plainCompany = isEncrypted(row.company)
          ? decryptString(row.company)
          : row.company;
        const plainJobTitle = isEncrypted(row.jobTitle)
          ? decryptString(row.jobTitle)
          : row.jobTitle;
        const plainLocation =
          row.location != null && isEncrypted(row.location)
            ? decryptString(row.location)
            : row.location;
        const plainEmailSubject =
          row.emailSubject != null && isEncrypted(row.emailSubject)
            ? decryptString(row.emailSubject)
            : row.emailSubject;
        if (
          plainCompany === row.company &&
          plainJobTitle === row.jobTitle &&
          plainLocation === row.location &&
          plainEmailSubject === row.emailSubject
        )
          return;

        await queryRunner.query(
          `UPDATE "applications" SET company = $1, "jobTitle" = $2, location = $3, "emailSubject" = $4 WHERE id = $5`,
          [
            plainCompany,
            plainJobTitle,
            plainLocation,
            plainEmailSubject,
            row.id,
          ],
        );
      },
    );

    await this.forEachBatch<EmailConnectionRow>(
      queryRunner,
      `SELECT id, email FROM "email_connections" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        if (!isEncrypted(row.email)) return;
        await queryRunner.query(
          `UPDATE "email_connections" SET email = $1 WHERE id = $2`,
          [decryptString(row.email), row.id],
        );
      },
    );

    await this.forEachBatch<ApplicationEmailRow>(
      queryRunner,
      `SELECT id, subject, body FROM "application_emails" ORDER BY id LIMIT ${BATCH_SIZE} OFFSET $1`,
      async (row) => {
        const plainSubject =
          row.subject != null && isEncrypted(row.subject)
            ? decryptString(row.subject)
            : row.subject;
        const plainBody =
          row.body != null && isEncrypted(row.body)
            ? decryptString(row.body)
            : row.body;
        if (plainSubject === row.subject && plainBody === row.body) return;

        await queryRunner.query(
          `UPDATE "application_emails" SET subject = $1, body = $2 WHERE id = $3`,
          [plainSubject, plainBody, row.id],
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
