import { HttpException, HttpStatus } from '@nestjs/common';
import { EmailProvider } from '../entities/email-connection.entity';
import { ApplicationStatus } from '@applications/entities/application.entity';

export interface SyncProgress {
  percent: number;
  done?: boolean;
  current?: number;
  total?: number;
  estimatedSecondsRemaining?: number;
  synced?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  notRelevant?: number;
  aiUnavailable?: number;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  error?: boolean;
  labelMissing?: boolean;
}

export interface SyncStatus {
  gmail: SyncProgress | null;
  outlook: SyncProgress | null;
}

export class SyncRateLimitedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `Synchronisation limitée à 3 essais, puis 1 essai toutes les 6 heures. Réessayez dans ${Math.ceil(retryAfterSeconds / 3600)} heure(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  notRelevant: number;
  aiUnavailable: number;
  labelMissing?: boolean;
}

export interface NormalizedEmailMessage {
  msgId: string;
  subject: string;
  body: string;
  threadId?: string;
  receivedAt: Date | null;
  from: string;
}

export interface EmailSyncProvider {
  readonly provider: EmailProvider;
  readonly logTag: string;
  fetchMessages(
    cutoff: Date,
    maxMessages?: number,
  ): Promise<NormalizedEmailMessage[]>;
  applyLabel(msgId: string, status: ApplicationStatus): Promise<void>;
}

export const OSTIA_LABEL = 'OstIA';
