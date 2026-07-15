import { MigrationInterface, QueryRunner } from 'typeorm';
import { decryptString, isEncrypted } from '../common/crypto.util';

interface EmailConnectionRow {
  id: string;
  accessToken: string;
  refreshToken: string | null;
}

export class ResetUndecryptableEmailConnections1783709300004 implements MigrationInterface {
  name = 'ResetUndecryptableEmailConnections1783709300004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT id, "accessToken", "refreshToken" FROM "email_connections"`,
    )) as EmailConnectionRow[];

    const staleIds = rows
      .filter((row) => !this.isDecryptable(row.accessToken, row.refreshToken))
      .map((row) => row.id);

    if (staleIds.length === 0) return;

    await queryRunner.query(
      `DELETE FROM "email_connections" WHERE id = ANY($1)`,
      [staleIds],
    );
  }

  public async down(): Promise<void> {}

  private isDecryptable(
    accessToken: string,
    refreshToken: string | null,
  ): boolean {
    try {
      if (isEncrypted(accessToken)) decryptString(accessToken);
      if (refreshToken != null && isEncrypted(refreshToken))
        decryptString(refreshToken);
      return true;
    } catch {
      return false;
    }
  }
}
