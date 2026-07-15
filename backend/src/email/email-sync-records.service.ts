import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmailSyncRecord,
  EmailSyncStatus,
} from './entities/email-sync-record.entity';
import { EmailProvider } from './entities/email-connection.entity';
import { User } from '@users/entities/user.entity';
import { Application } from '@applications/entities/application.entity';

@Injectable()
export class EmailSyncRecordsService {
  constructor(
    @InjectRepository(EmailSyncRecord)
    private readonly repo: Repository<EmailSyncRecord>,
  ) {}

  async find(
    userId: string,
    provider: EmailProvider,
    externalMessageId: string,
  ): Promise<EmailSyncRecord | null> {
    return this.repo.findOne({
      where: { user: { id: userId }, provider, externalMessageId },
    });
  }

  async findAllForProvider(
    userId: string,
    provider: EmailProvider,
  ): Promise<EmailSyncRecord[]> {
    return this.repo.find({
      where: { user: { id: userId }, provider },
      relations: { application: true },
    });
  }

  async removeRecords(records: EmailSyncRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    await this.repo.remove(records);
    return records.length;
  }

  shouldSkip(record: EmailSyncRecord | null): boolean {
    return !!record && record.status !== EmailSyncStatus.FAILED;
  }

  async upsert(
    userId: string,
    provider: EmailProvider,
    externalMessageId: string,
    status: EmailSyncStatus,
    opts?: {
      applicationId?: string;
      reason?: string;
      matchConfidence?: 'certain' | 'ambiguous';
    },
  ): Promise<EmailSyncRecord> {
    const existing = await this.find(userId, provider, externalMessageId);
    const application = opts?.applicationId
      ? ({ id: opts.applicationId } as Application)
      : null;
    const reason = opts?.reason?.slice(0, 255) ?? null;
    const matchConfidence = opts?.matchConfidence ?? null;

    if (existing) {
      existing.status = status;
      existing.application = application;
      existing.reason = reason;
      existing.matchConfidence = matchConfidence;
      existing.attemptCount += 1;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({
        user: { id: userId } as User,
        provider,
        externalMessageId,
        status,
        application,
        reason,
        matchConfidence,
        attemptCount: 1,
      }),
    );
  }

  async findAmbiguousApplicationIds(userId: string): Promise<Set<string>> {
    const records = await this.repo.find({
      where: { user: { id: userId }, matchConfidence: 'ambiguous' },
      relations: { application: true },
    });
    return new Set(
      records.map((r) => r.application?.id).filter((id): id is string => !!id),
    );
  }
}
