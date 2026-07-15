import { Logger } from '@nestjs/common';
import {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from '@applications/entities/application.entity';
import { CreateApplicationDto } from '@applications/dto/create-application.dto';
import { ApplicationsService } from '@applications/applications.service';
import { ApplicationEmailsService } from '@applications/application-emails.service';
import { User } from '@users/entities/user.entity';
import { AiService } from '@ai/ai.service';
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

const HIGH_STAKES_STATUSES = new Set<ApplicationStatus>([
  ApplicationStatus.REJECTED,
  ApplicationStatus.OFFER,
]);

const STATUS_PROGRESSION: ApplicationStatus[] = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.ACKNOWLEDGED,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.TECHNICAL,
  ApplicationStatus.OFFER,
];

function isForwardStatusTransition(
  current: ApplicationStatus,
  next: ApplicationStatus,
): boolean {
  if (next === ApplicationStatus.REJECTED) return true;
  const currentRank = STATUS_PROGRESSION.indexOf(current);
  const nextRank = STATUS_PROGRESSION.indexOf(next);
  if (currentRank === -1 || nextRank === -1) return true;
  return nextRank > currentRank;
}

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

function isValidApplicationStatus(
  value: string | null,
): value is ApplicationStatus {
  return (
    !!value &&
    (Object.values(ApplicationStatus) as string[]).includes(value)
  );
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
  const allMessages = await provider.fetchMessages(
    getSyncCutoffDate(),
    deps.maxMessages,
  );
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
  let notRelevant = 0;
  let aiUnavailable = 0;
  const user = { id: userId } as User;
  const normalizedConnectionEmail = connectionEmail.toLowerCase();
  const applications: Application[] =
    total > 0 ? await applicationsService.findAllByUser(userId) : [];

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

    const dossierMatch = await applicationsService.findDossierForEmail(
      userId,
      { threadId, text: fullText },
      applications,
    );

    if (dossierMatch.kind !== 'none') {
      const dossier = dossierMatch.application;
      const matchConfidence = dossierMatch.kind;
      if (dossier.status === ApplicationStatus.REJECTED) {
        await syncRecordsService.upsert(
          userId,
          provider.provider,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: dossier.id, matchConfidence },
        );
        skipped++;
        continue;
      }

      let sameApplication = true;

      try {
        let newStatus: ApplicationStatus | null;
        if (isSelfSent) {
          newStatus = null;
        } else if (dossierMatch.kind === 'ambiguous') {
          await sleep(AI_REQUEST_DELAY_MS);
          const aiResult = await aiService.detectStatusUpdate(
            subject,
            freshBody,
            dossier.company,
            dossier.jobTitle,
            dossier.status,
          );
          sameApplication = aiResult.sameApplication;
          if (aiResult.status && !isValidApplicationStatus(aiResult.status)) {
            logger.warn(
              `${provider.logTag} AI returned unknown status "${aiResult.status}" for message ${msgId}, ignoring`,
            );
          }
          const aiStatus =
            isValidApplicationStatus(aiResult.status) &&
            aiResult.confidence !== 'low'
              ? aiResult.status
              : null;
          newStatus = sameApplication
            ? keywordStatus && !HIGH_STAKES_STATUSES.has(keywordStatus)
              ? keywordStatus
              : aiStatus
            : null;
        } else if (keywordStatus && !HIGH_STAKES_STATUSES.has(keywordStatus)) {
          newStatus = keywordStatus;
        } else {
          await sleep(AI_REQUEST_DELAY_MS);
          const aiResult = await aiService.detectStatusUpdate(
            subject,
            freshBody,
            dossier.company,
            dossier.jobTitle,
            dossier.status,
          );
          if (aiResult.status && aiResult.confidence === 'low') {
            logger.log(
              `${provider.logTag} AI returned ${aiResult.status} with low confidence for dossier ${dossier.id}; ignoring`,
            );
            newStatus = null;
          } else {
            newStatus = isValidApplicationStatus(aiResult.status)
              ? aiResult.status
              : null;
          }
          if (keywordStatus && keywordStatus !== newStatus) {
            logger.log(
              `${provider.logTag} keyword flagged ${keywordStatus} but AI returned ${aiResult.status} (confidence=${aiResult.confidence}) for dossier ${dossier.id}; trusting AI`,
            );
          }
        }

        if (sameApplication) {
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
          if (
            newStatus &&
            newStatus !== dossier.status &&
            !isForwardStatusTransition(dossier.status, newStatus)
          ) {
            logger.log(
              `${provider.logTag} ignoring backward status transition ${dossier.status} -> ${newStatus} for dossier ${dossier.id}`,
            );
            newStatus = null;
          }
          const statusChanged = !!newStatus && newStatus !== dossier.status;
          if (statusChanged) updates.status = newStatus!;

          if (Object.keys(updates).length > 0) {
            await applicationsService.update(userId, dossier.id, updates);
            Object.assign(dossier, updates);
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
            { applicationId: dossier.id, matchConfidence },
          );
          if (statusChanged) updated++;
          else skipped++;
          continue;
        }

        logger.log(
          `${provider.logTag} AI rejected ambiguous dossier match for message ${msgId} (dossier ${dossier.id}); treating as a separate application`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(
          `${provider.logTag} Failed to update dossier for message ${msgId}: ${msg}`,
        );
        await syncRecordsService.upsert(
          userId,
          provider.provider,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: msg },
        );
        failed++;
        continue;
      }
    }

    if (isSelfSent) {
      await syncRecordsService.upsert(
        userId,
        provider.provider,
        msgId,
        EmailSyncStatus.NOT_RELEVANT,
        { reason: 'Self-sent message' },
      );
      notRelevant++;
      continue;
    }

    await sleep(AI_REQUEST_DELAY_MS);
    const parseResult = await aiService.parseEmailForApplication(
      subject,
      freshBody,
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
      notRelevant++;
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
      notRelevant++;
      continue;
    }

    let resolvedStatus = (keywordStatus ?? parsed.status) as ApplicationStatus;
    if (
      keywordStatus &&
      HIGH_STAKES_STATUSES.has(keywordStatus) &&
      parsed.status !== (keywordStatus as string)
    ) {
      logger.log(
        `${provider.logTag} keyword flagged ${keywordStatus} but AI parse returned ${parsed.status} (confidence=${parsed.statusConfidence}) for message ${msgId}; trusting AI`,
      );
      resolvedStatus = parsed.status as ApplicationStatus;
    } else if (!keywordStatus && parsed.statusConfidence === 'low') {
      logger.log(
        `${provider.logTag} low-confidence AI status ${parsed.status} for message ${msgId}; defaulting to APPLIED`,
      );
      resolvedStatus = ApplicationStatus.APPLIED;
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
        appliedAt: parsed.appliedAt ?? receivedAt?.toISOString() ?? undefined,
        notes: parsed.notes ?? undefined,
      };
      const app = await applicationsService.create(user, dto);
      created++;
      applications.push(app);
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

  return {
    synced: total,
    created,
    updated,
    skipped,
    failed,
    notRelevant,
    aiUnavailable,
  };
}
