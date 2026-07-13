import { Logger } from '@nestjs/common';
import {
  ApplicationSource,
  ApplicationStatus,
} from '../../applications/entities/application.entity';
import { CreateApplicationDto } from '../../applications/dto/create-application.dto';
import { ApplicationsService } from '../../applications/applications.service';
import { ApplicationEmailsService } from '../../applications/application-emails.service';
import { User } from '../../users/entities/user.entity';
import { AiService } from '../../ai/ai.service';
import { EmailSyncStatus } from '../entities/email-sync-record.entity';
import { EmailSyncRecordsService } from '../email-sync-records.service';
import { detectStatusByKeywords } from '../utils/status-keywords';
import { stripQuotedReply } from '../utils/quote-stripper';
import {
  EmailSyncProvider,
  SyncProgress,
  SyncResult,
} from './email-sync.types';

export const AI_REQUEST_DELAY_MS = 2100;
export const EMAIL_SYNC_LOOKBACK_MONTHS = 2;
const ETA_UPDATE_INTERVAL_MS = 25_000;

export interface EmailSyncDeps {
  logger: Logger;
  syncRecordsService: EmailSyncRecordsService;
  applicationsService: ApplicationsService;
  applicationEmailsService: ApplicationEmailsService;
  aiService: AiService;
  maxMessages?: number;
}

export function getSyncCutoffDate(): Date {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - EMAIL_SYNC_LOOKBACK_MONTHS);
  return cutoff;
}

export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, ' ')
    .replace(/<script[^>]*>.*?<\/script>/gis, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateSecondsRemaining(
  startedAt: number,
  processedCount: number,
  total: number,
): number {
  const remaining = total - processedCount;
  const avgMsPerItem =
    processedCount > 0
      ? (Date.now() - startedAt) / processedCount
      : AI_REQUEST_DELAY_MS;
  return Math.round((avgMsPerItem * remaining) / 1000);
}

function createEtaEstimator(
  startedAt: number,
): (processedCount: number, total: number) => number {
  let lastComputedAt = 0;
  let lastValue = 0;
  return (processedCount: number, total: number): number => {
    const now = Date.now();
    if (now - lastComputedAt >= ETA_UPDATE_INTERVAL_MS) {
      lastValue = estimateSecondsRemaining(startedAt, processedCount, total);
      lastComputedAt = now;
    }
    return lastValue;
  };
}

export async function runEmailSync(
  deps: EmailSyncDeps,
  provider: EmailSyncProvider,
  userId: string,
  connectionEmail: string,
  onProgress: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const {
    logger,
    syncRecordsService,
    applicationsService,
    applicationEmailsService,
    aiService,
  } = deps;

  onProgress({ percent: 5 });
  const allMessages = await provider.fetchMessages(getSyncCutoffDate());
  const messages = deps.maxMessages
    ? allMessages.slice(0, deps.maxMessages)
    : allMessages;
  if (deps.maxMessages && allMessages.length > deps.maxMessages) {
    logger.log(
      `${provider.logTag} Sync capped to ${deps.maxMessages}/${allMessages.length} messages (EMAIL_SYNC_MAX_MESSAGES)`,
    );
  }
  onProgress({ percent: 15 });

  const total = messages.length;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let aiUnavailable = 0;
  const user = { id: userId } as User;
  const normalizedConnectionEmail = connectionEmail.toLowerCase();

  const syncStartedAt = Date.now();
  const estimateEta = createEtaEstimator(syncStartedAt);

  for (let i = 0; i < messages.length; i++) {
    const { msgId, subject, from, body, threadId, receivedAt } = messages[i];
    onProgress({
      percent: 15 + Math.round(((i + 1) / total) * 70),
      current: i + 1,
      total,
      estimatedSecondsRemaining: estimateEta(i, total),
    });

    const existingRecord = await syncRecordsService.find(
      userId,
      provider.provider,
      msgId,
    );
    if (syncRecordsService.shouldSkip(existingRecord)) {
      skipped++;
      continue;
    }

    const isSelfSent = !!from && from === normalizedConnectionEmail;
    const cleanBody = stripHtml(body);
    const freshBody = stripQuotedReply(cleanBody);
    const fullText = `${subject} ${cleanBody}`;
    const keywordStatus = isSelfSent
      ? null
      : detectStatusByKeywords(`${subject} ${freshBody}`);

    const byEmailId = await applicationsService.findByEmailId(userId, msgId);
    if (byEmailId) {
      if (!byEmailId.emailBody && body) {
        await applicationsService.update(userId, byEmailId.id, {
          emailSubject: subject,
          emailBody: body.slice(0, 50000),
        });
      }
      await provider.applyLabel(msgId, byEmailId.status);
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.DUPLICATE,
        { applicationId: byEmailId.id },
      );
      skipped++;
      continue;
    }

    const dossier = await applicationsService.findDossierForEmail(userId, {
      threadId,
      text: fullText,
    });

    if (dossier) {
      if (dossier.status === ApplicationStatus.REJECTED) {
        await syncRecordsService.upsert(
          userId,
          provider.provider,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: dossier.id },
        );
        skipped++;
        continue;
      }

      let newStatus: ApplicationStatus | null;
      if (isSelfSent) {
        newStatus = null;
      } else if (
        keywordStatus &&
        keywordStatus !== ApplicationStatus.REJECTED
      ) {
        newStatus = keywordStatus;
      } else {
        await sleep(AI_REQUEST_DELAY_MS);
        newStatus = (await aiService.detectStatusUpdate(
          subject,
          freshBody,
          dossier.company,
          dossier.jobTitle,
          dossier.status,
        )) as ApplicationStatus | null;
        if (keywordStatus === ApplicationStatus.REJECTED) {
          logger.log(
            `${provider.logTag} keyword flagged REJECTED but AI returned ${newStatus} for dossier ${dossier.id}; trusting AI`,
          );
        }
      }

      const updates: {
        emailSubject?: string;
        emailBody?: string;
        threadId?: string;
        status?: ApplicationStatus;
      } = {};
      if (!dossier.emailBody && body) {
        updates.emailSubject = subject;
        updates.emailBody = body.slice(0, 50000);
      }
      if (!dossier.threadId && threadId) updates.threadId = threadId;
      const statusChanged = !!newStatus && newStatus !== dossier.status;
      if (statusChanged) updates.status = newStatus!;

      if (Object.keys(updates).length > 0) {
        await applicationsService.update(userId, dossier.id, updates);
      }
      if (!isSelfSent) {
        await applicationEmailsService.record(
          userId,
          dossier.id,
          provider.provider,
          msgId,
          {
            subject,
            body: body.slice(0, 50000),
            statusDetected: statusChanged ? newStatus : null,
            receivedAt,
          },
        );
      }
      await provider.applyLabel(msgId, newStatus ?? dossier.status);
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.DUPLICATE,
        { applicationId: dossier.id },
      );
      if (statusChanged) updated++;
      else skipped++;
      continue;
    }

    if (isSelfSent) {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.NOT_RELEVANT,
        { reason: 'Self-sent message' },
      );
      failed++;
      continue;
    }

    await sleep(AI_REQUEST_DELAY_MS);
    const parseResult = await aiService.parseEmailForApplication(
      subject,
      cleanBody,
      msgId,
    );

    if (parseResult.kind === 'not-relevant') {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.NOT_RELEVANT,
        { reason: parseResult.reason },
      );
      failed++;
      continue;
    }

    if (parseResult.kind === 'unavailable') {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.FAILED,
        { reason: parseResult.reason },
      );
      aiUnavailable++;
      continue;
    }

    if (parseResult.kind === 'failed') {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.FAILED,
        { reason: parseResult.reason },
      );
      failed++;
      continue;
    }

    const parsed = parseResult.data;

    if (!parsed.company || !parsed.jobTitle) {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.NOT_RELEVANT,
        { reason: 'Missing company or jobTitle' },
      );
      failed++;
      continue;
    }

    let resolvedStatus = (keywordStatus ?? parsed.status) as ApplicationStatus;
    if (
      keywordStatus === ApplicationStatus.REJECTED &&
      parsed.status !== (ApplicationStatus.REJECTED as string)
    ) {
      logger.log(
        `${provider.logTag} keyword flagged REJECTED but AI parse returned ${parsed.status} for message ${msgId}; trusting AI`,
      );
      resolvedStatus = parsed.status as ApplicationStatus;
    }

    try {
      const dto: CreateApplicationDto = {
        company: parsed.company,
        jobTitle: parsed.jobTitle,
        status: resolvedStatus,
        source: ApplicationSource.EMAIL,
        emailSubject: subject,
        emailBody: body.slice(0, 50000),
        emailId: msgId,
        threadId,
        location: parsed.location ?? undefined,
        appliedAt: parsed.appliedAt ?? undefined,
        notes: parsed.notes ?? undefined,
      };
      const app = await applicationsService.create(user, dto);
      created++;
      await applicationEmailsService.record(
        userId,
        app.id,
        provider.provider,
        msgId,
        {
          subject,
          body: body.slice(0, 50000),
          statusDetected: app.status,
          receivedAt,
        },
      );
      await provider.applyLabel(msgId, app.status);
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.CREATED,
        { applicationId: app.id },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        `${provider.logTag} Failed to create application for message ${msgId}: ${msg}`,
      );
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.FAILED,
        { reason: msg },
      );
      failed++;
    }
  }

  return { synced: total, created, updated, skipped, failed, aiUnavailable };
}
