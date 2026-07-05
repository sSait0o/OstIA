import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { Observable } from 'rxjs';
import axios from 'axios';
import {
  EmailConnection,
  EmailProvider,
} from './entities/email-connection.entity';
import { EmailSyncStatus } from './entities/email-sync-record.entity';
import { EmailSyncRecordsService } from './email-sync-records.service';
import { User } from '../users/entities/user.entity';
import { AiService } from '../ai/ai.service';
import { ApplicationsService } from '../applications/applications.service';
import {
  ApplicationSource,
  ApplicationStatus,
} from '../applications/entities/application.entity';
import { CreateApplicationDto } from '../applications/dto/create-application.dto';
import { EncryptionService } from '../common/encryption.service';
import { detectStatusByKeywords } from './status-keywords';
import { stripQuotedReply } from './quote-stripper';

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
      `Synchronisation limitée à une fois par heure. Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
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
  aiUnavailable: number;
  labelMissing?: boolean;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface MicrosoftProfile {
  mail?: string;
  userPrincipalName?: string;
}

interface OutlookFolder {
  displayName?: string;
  id?: string;
}

interface OutlookMessage {
  subject?: string;
  body?: { content?: string };
  internetMessageId?: string;
  id?: string;
  conversationId?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string } };
}

const AI_REQUEST_DELAY_MS = 2100;

const EMAIL_SYNC_LOOKBACK_MONTHS = 2;

const SYNC_RATE_LIMIT_MS = 60 * 60 * 1000;

const ETA_UPDATE_INTERVAL_MS = 60_000;

const OSTIA_LABEL = 'OstIA';
const OSTIA_SUBLABELS = [
  'Accepté',
  'Entretien',
  'Envoyé',
  'Refusé',
  'Test Technique',
];

const STATUS_TO_SUBLABEL: Partial<Record<ApplicationStatus, string>> = {
  [ApplicationStatus.APPLIED]: 'Envoyé',
  [ApplicationStatus.ACKNOWLEDGED]: 'Envoyé',
  [ApplicationStatus.TECHNICAL]: 'Test Technique',
  [ApplicationStatus.INTERVIEW]: 'Entretien',
  [ApplicationStatus.OFFER]: 'Accepté',
  [ApplicationStatus.REJECTED]: 'Refusé',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly googleOAuth2Client: OAuth2Client;
  private readonly activeSyncs = new Map<string, SyncProgress>();

  constructor(
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly aiService: AiService,
    private readonly applicationsService: ApplicationsService,
    private readonly syncRecordsService: EmailSyncRecordsService,
  ) {
    this.googleOAuth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_REDIRECT_URI'),
    );
  }

  createOAuthState(userId: string): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${userId}.${nonce}`;
    const sig = crypto
      .createHmac('sha256', this.configService.get<string>('JWT_SECRET')!)
      .update(payload)
      .digest('hex');
    return `${payload}.${sig}`;
  }

  verifyOAuthState(state: string): string | null {
    try {
      const lastDot = state.lastIndexOf('.');
      const secondLastDot = state.lastIndexOf('.', lastDot - 1);
      if (lastDot === -1 || secondLastDot === -1) return null;
      const payload = state.slice(0, lastDot);
      const sig = state.slice(lastDot + 1);
      const userId = state.slice(0, secondLastDot);
      const expectedSig = crypto
        .createHmac('sha256', this.configService.get<string>('JWT_SECRET')!)
        .update(payload)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expectedSig, 'hex'),
      )
        ? userId
        : null;
    } catch {
      return null;
    }
  }

  getGoogleAuthUrl(userId: string): string {
    return this.googleOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.modify'],
      state: this.createOAuthState(userId),
    });
  }

  async handleGoogleCallback(
    code: string,
    userId: string,
  ): Promise<EmailConnection> {
    const { tokens } = await this.googleOAuth2Client.getToken(code);
    this.googleOAuth2Client.setCredentials(tokens);

    const gmail = google.gmail({
      version: 'v1',
      auth: this.googleOAuth2Client,
    });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    await this.ensureOstiaLabels(gmail);

    const existing = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });

    const connection =
      existing ??
      this.connectionRepo.create({
        user: { id: userId } as User,
        provider: EmailProvider.GMAIL,
      });

    connection.email = profile.data.emailAddress ?? '';
    connection.accessToken = this.encryptionService.encrypt(
      tokens.access_token!,
    );
    if (tokens.refresh_token)
      connection.refreshToken = this.encryptionService.encrypt(
        tokens.refresh_token,
      );
    if (tokens.expiry_date)
      connection.tokenExpiresAt = new Date(tokens.expiry_date);
    connection.isActive = true;

    return this.connectionRepo.save(connection);
  }

  async syncGmailEmails(userId: string): Promise<SyncResult> {
    return this.doGmailSync(userId, () => {});
  }

  getSyncStatus(userId: string): SyncStatus {
    return {
      gmail:
        this.activeSyncs.get(this.syncKey(userId, EmailProvider.GMAIL)) ??
        null,
      outlook:
        this.activeSyncs.get(this.syncKey(userId, EmailProvider.OUTLOOK)) ??
        null,
    };
  }

  private syncKey(userId: string, provider: EmailProvider): string {
    return `${userId}:${provider}`;
  }

  syncGmailStream(userId: string): Observable<MessageEvent> {
    const key = this.syncKey(userId, EmailProvider.GMAIL);
    return new Observable((subscriber) => {
      const emit = (data: SyncProgress) => {
        this.activeSyncs.set(key, data);
        subscriber.next({ data } as unknown as MessageEvent);
      };
      emit({ percent: 0 });

      this.doGmailSync(userId, emit)
        .then((result) => {
          emit({ percent: 100, done: true, ...result });
          subscriber.complete();
        })
        .catch((err: unknown) => {
          if (err instanceof SyncRateLimitedException) {
            emit({
              percent: 100,
              done: true,
              rateLimited: true,
              retryAfterSeconds: err.retryAfterSeconds,
            });
            subscriber.complete();
            return;
          }
          emit({ percent: 100, done: true, error: true });
          subscriber.error(err);
        });
    });
  }

  private async doGmailSync(
    userId: string,
    onProgress: (p: SyncProgress) => void,
  ): Promise<SyncResult> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) throw new NotFoundException('Connexion Gmail non trouvée');
    await this.enforceSyncRateLimit(connection);

    this.googleOAuth2Client.setCredentials({
      access_token: this.encryptionService.decrypt(connection.accessToken),
      ...(connection.refreshToken
        ? {
            refresh_token: this.encryptionService.decrypt(
              connection.refreshToken,
            ),
          }
        : {}),
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: this.googleOAuth2Client,
    });
    const labelMap = await this.ensureOstiaLabels(gmail);
    const ostiaLabelId = labelMap.get(OSTIA_LABEL);

    if (!ostiaLabelId)
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        aiUnavailable: 0,
        labelMissing: true,
      };

    const cutoff = this.getSyncCutoffDate();
    const cutoffQuery = `after:${cutoff.getFullYear()}/${String(
      cutoff.getMonth() + 1,
    ).padStart(2, '0')}/${String(cutoff.getDate()).padStart(2, '0')}`;

    const allMessages: gmail_v1.Schema$Message[] = [];
    let messagesPageToken: string | undefined;
    do {
      const page = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [ostiaLabelId],
        q: cutoffQuery,
        maxResults: 100,
        pageToken: messagesPageToken,
      });
      allMessages.push(...(page.data.messages ?? []));
      messagesPageToken = page.data.nextPageToken ?? undefined;
    } while (messagesPageToken);

    if (allMessages.length === 0)
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        aiUnavailable: 0,
      };

    const msgList = allMessages.filter((m) => !!m.id);
    const total = msgList.length;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let aiUnavailable = 0;
    const user = { id: userId } as User;

    onProgress({ percent: 5 });
    const fetched = await Promise.all(
      msgList.map(async (msg) => {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });
        const headers: gmail_v1.Schema$MessagePartHeader[] =
          full.data?.payload?.headers ?? [];
        const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
        const from = this.extractEmailAddress(
          headers.find((h) => h.name === 'From')?.value ?? '',
        );
        const body = this.extractGmailBody(full.data?.payload);
        const threadId = full.data?.threadId ?? undefined;
        const internalDate = Number(full.data?.internalDate ?? 0);
        return { msgId: msg.id!, subject, from, body, threadId, internalDate };
      }),
    );
    fetched.sort((a, b) => a.internalDate - b.internalDate);
    onProgress({ percent: 15 });

    const syncStartedAt = Date.now();
    const estimateEta = this.createEtaEstimator(syncStartedAt);
    for (let i = 0; i < fetched.length; i++) {
      const { msgId, subject, from, body, threadId } = fetched[i];
      onProgress({
        percent: 15 + Math.round(((i + 1) / total) * 70),
        current: i + 1,
        total,
        estimatedSecondsRemaining: estimateEta(i, total),
      });

      const existingRecord = await this.syncRecordsService.find(
        userId,
        EmailProvider.GMAIL,
        msgId,
      );
      if (this.syncRecordsService.shouldSkip(existingRecord)) {
        skipped++;
        continue;
      }

      const isSelfSent = !!from && from === connection.email.toLowerCase();
      const cleanBody = this.stripHtml(body);
      const freshBody = stripQuotedReply(cleanBody);
      const fullText = `${subject} ${cleanBody}`;
      const keywordStatus = isSelfSent
        ? null
        : detectStatusByKeywords(`${subject} ${freshBody}`);

      const byEmailId = await this.applicationsService.findByEmailId(
        userId,
        msgId,
      );
      if (byEmailId) {
        if (!byEmailId.emailBody && body) {
          await this.applicationsService.update(userId, byEmailId.id, {
            emailSubject: subject,
            emailBody: body.slice(0, 50000),
          });
        }
        await this.applyGmailSublabel(gmail, msgId, byEmailId.status, labelMap);
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: byEmailId.id },
        );
        skipped++;
        continue;
      }

      const dossier = await this.applicationsService.findDossierForEmail(
        userId,
        { threadId, text: fullText },
      );

      if (dossier) {
        if (dossier.status === ApplicationStatus.REJECTED) {
          await this.syncRecordsService.upsert(
            userId,
            EmailProvider.GMAIL,
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
        } else if (keywordStatus) {
          newStatus = keywordStatus;
        } else {
          await this.sleep(AI_REQUEST_DELAY_MS);
          newStatus = (await this.aiService.detectStatusUpdate(
            subject,
            freshBody,
            dossier.company,
            dossier.jobTitle,
            dossier.status,
          )) as ApplicationStatus | null;
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
          await this.applicationsService.update(userId, dossier.id, updates);
        }
        await this.applyGmailSublabel(
          gmail,
          msgId,
          newStatus ?? dossier.status,
          labelMap,
        );
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: dossier.id },
        );
        if (statusChanged) updated++;
        else skipped++;
        continue;
      }

      if (isSelfSent) {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: 'Self-sent message' },
        );
        failed++;
        continue;
      }

      await this.sleep(AI_REQUEST_DELAY_MS);
      const parseResult = await this.aiService.parseEmailForApplication(
        subject,
        cleanBody,
        msgId,
      );

      if (parseResult.kind === 'not-relevant') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: parseResult.reason },
        );
        failed++;
        continue;
      }

      if (parseResult.kind === 'unavailable') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: parseResult.reason },
        );
        aiUnavailable++;
        continue;
      }

      if (parseResult.kind === 'failed') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: parseResult.reason },
        );
        failed++;
        continue;
      }

      const parsed = parseResult.data;

      if (!parsed.company || !parsed.jobTitle) {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: 'Missing company or jobTitle' },
        );
        failed++;
        continue;
      }

      try {
        const dto: CreateApplicationDto = {
          company: parsed.company,
          jobTitle: parsed.jobTitle,
          status: (keywordStatus ?? parsed.status) as ApplicationStatus,
          source: ApplicationSource.EMAIL,
          emailSubject: subject,
          emailBody: body.slice(0, 50000),
          emailId: msgId,
          threadId,
          location: parsed.location ?? undefined,
          appliedAt: parsed.appliedAt ?? undefined,
          notes: parsed.notes ?? undefined,
        };
        const app = await this.applicationsService.create(user, dto);
        created++;
        await this.applyGmailSublabel(gmail, msgId, app.status, labelMap);
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.CREATED,
          { applicationId: app.id },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[EmailSync] Failed to create application for message ${msgId}: ${msg}`,
        );
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.GMAIL,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: msg },
        );
        failed++;
      }
    }

    return { synced: total, created, updated, skipped, failed, aiUnavailable };
  }

  private async applyGmailSublabel(
    gmail: gmail_v1.Gmail,
    msgId: string,
    status: ApplicationStatus,
    labelMap: Map<string, string>,
  ): Promise<void> {
    const sublabel = STATUS_TO_SUBLABEL[status];

    if (!sublabel) {
      const sublabelIds = OSTIA_SUBLABELS.map((sub) =>
        labelMap.get(`${OSTIA_LABEL}/${sub}`),
      );
      const allOstiaLabelIds = [
        labelMap.get(OSTIA_LABEL),
        ...sublabelIds,
      ].filter((id): id is string => !!id);
      if (allOstiaLabelIds.length === 0) return;
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: msgId,
          requestBody: { removeLabelIds: allOstiaLabelIds },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[EmailSync] Failed to remove OstIA labels from message ${msgId}: ${msg}`,
        );
      }
      return;
    }

    const targetSublabelName = `${OSTIA_LABEL}/${sublabel}`;
    const targetSublabelId = labelMap.get(targetSublabelName);
    if (!targetSublabelId) return;

    const otherSublabelIds = OSTIA_SUBLABELS.map((sub) =>
      labelMap.get(`${OSTIA_LABEL}/${sub}`),
    ).filter((id): id is string => !!id && id !== targetSublabelId);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: msgId,
        requestBody: {
          addLabelIds: [targetSublabelId],
          removeLabelIds: otherSublabelIds,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[EmailSync] Failed to apply label to message ${msgId}: ${msg}`,
      );
    }
  }

  private async ensureOstiaLabels(
    gmail: gmail_v1.Gmail,
  ): Promise<Map<string, string>> {
    const labelMap = new Map<string, string>();
    const { data } = await gmail.users.labels.list({ userId: 'me' });
    let existingLabels: gmail_v1.Schema$Label[] = data.labels ?? [];

    const parentId = existingLabels.find((l) => l.name === OSTIA_LABEL)?.id;
    if (!parentId) return labelMap;
    labelMap.set(OSTIA_LABEL, parentId);

    const getOrCreateLabel = async (
      name: string,
    ): Promise<string | undefined> => {
      const found = existingLabels.find((l) => l.name === name)?.id;
      if (found) return found;

      try {
        const res = await gmail.users.labels.create({
          userId: 'me',
          requestBody: { name },
        });
        return res.data.id ?? undefined;
      } catch (err: unknown) {
        const status =
          (err as { code?: number })?.code ??
          (err as { response?: { status?: number } })?.response?.status;
        if (status !== 409) throw err;

        const refreshed = await gmail.users.labels.list({ userId: 'me' });
        existingLabels = refreshed.data.labels ?? [];
        return existingLabels.find((l) => l.name === name)?.id ?? undefined;
      }
    };

    for (const sub of OSTIA_SUBLABELS) {
      const fullName = `${OSTIA_LABEL}/${sub}`;
      const labelId = await getOrCreateLabel(fullName);
      if (labelId) labelMap.set(fullName, labelId);
    }

    return labelMap;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private estimateSecondsRemaining(
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

  private createEtaEstimator(
    startedAt: number,
  ): (processedCount: number, total: number) => number {
    let lastComputedAt = 0;
    let lastValue = 0;
    return (processedCount: number, total: number): number => {
      const now = Date.now();
      if (now - lastComputedAt >= ETA_UPDATE_INTERVAL_MS) {
        lastValue = this.estimateSecondsRemaining(
          startedAt,
          processedCount,
          total,
        );
        lastComputedAt = now;
      }
      return lastValue;
    };
  }

  private getSyncCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - EMAIL_SYNC_LOOKBACK_MONTHS);
    return cutoff;
  }

  private isSyncRateLimitEnabled(): boolean {
    return this.configService.get('NODE_ENV') === 'production';
  }

  private computeNextSyncAvailableAt(lastSyncedAt: Date | null): string | null {
    if (!this.isSyncRateLimitEnabled() || !lastSyncedAt) return null;
    const nextAvailableAt = lastSyncedAt.getTime() + SYNC_RATE_LIMIT_MS;
    return nextAvailableAt > Date.now()
      ? new Date(nextAvailableAt).toISOString()
      : null;
  }

  private async enforceSyncRateLimit(
    connection: EmailConnection,
  ): Promise<void> {
    if (this.isSyncRateLimitEnabled() && connection.lastSyncedAt) {
      const elapsed = Date.now() - connection.lastSyncedAt.getTime();
      if (elapsed < SYNC_RATE_LIMIT_MS) {
        throw new SyncRateLimitedException(
          Math.ceil((SYNC_RATE_LIMIT_MS - elapsed) / 1000),
        );
      }
    }
    connection.lastSyncedAt = new Date();
    await this.connectionRepo.save(connection);
  }

  private extractEmailAddress(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gis, ' ')
      .replace(/<script[^>]*>.*?<\/script>/gis, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractGmailBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
  ): string {
    if (!payload) return '';
    if (payload.body?.data)
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.parts) {
      let plainText = '';
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/plain' && part.body?.data) {
          plainText = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          const nested = this.extractGmailBody(part);
          if (nested) return nested;
        }
      }
      return plainText;
    }
    return '';
  }

  getMicrosoftAuthUrl(userId: string): string {
    const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID');
    const redirectUri = this.configService.get<string>(
      'MICROSOFT_REDIRECT_URI',
    );
    const tenant = this.configService.get<string>(
      'MICROSOFT_TENANT_ID',
      'common',
    );
    const scope = encodeURIComponent('offline_access Mail.Read');
    return (
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
      `?client_id=${clientId}&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri as string)}` +
      `&scope=${scope}&state=${userId}`
    );
  }

  async handleMicrosoftCallback(
    code: string,
    userId: string,
  ): Promise<EmailConnection> {
    const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>(
      'MICROSOFT_CLIENT_SECRET',
    )!;
    const redirectUri = this.configService.get<string>(
      'MICROSOFT_REDIRECT_URI',
    )!;
    const tenant = this.configService.get<string>(
      'MICROSOFT_TENANT_ID',
      'common',
    );

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await axios.post<MicrosoftTokenResponse>(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const profileRes = await axios.get<MicrosoftProfile>(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );
    const email: string =
      profileRes.data.mail ?? profileRes.data.userPrincipalName ?? '';

    const existing = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.OUTLOOK },
    });

    const connection =
      existing ??
      this.connectionRepo.create({
        user: { id: userId } as User,
        provider: EmailProvider.OUTLOOK,
      });

    connection.email = email;
    connection.accessToken = this.encryptionService.encrypt(access_token);
    if (refresh_token)
      connection.refreshToken = this.encryptionService.encrypt(refresh_token);
    connection.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    connection.isActive = true;

    return this.connectionRepo.save(connection);
  }

  async syncOutlookEmails(userId: string): Promise<SyncResult> {
    return this.doOutlookSync(userId, () => {});
  }

  syncOutlookStream(userId: string): Observable<MessageEvent> {
    const key = this.syncKey(userId, EmailProvider.OUTLOOK);
    return new Observable((subscriber) => {
      const emit = (data: SyncProgress) => {
        this.activeSyncs.set(key, data);
        subscriber.next({ data } as unknown as MessageEvent);
      };
      emit({ percent: 0 });

      this.doOutlookSync(userId, emit)
        .then((result) => {
          emit({ percent: 100, done: true, ...result });
          subscriber.complete();
        })
        .catch((err: unknown) => {
          if (err instanceof SyncRateLimitedException) {
            emit({
              percent: 100,
              done: true,
              rateLimited: true,
              retryAfterSeconds: err.retryAfterSeconds,
            });
            subscriber.complete();
            return;
          }
          emit({ percent: 100, done: true, error: true });
          subscriber.error(err);
        });
    });
  }

  private async doOutlookSync(
    userId: string,
    onProgress: (p: SyncProgress) => void,
  ): Promise<SyncResult> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.OUTLOOK },
    });
    if (!connection)
      throw new NotFoundException('Connexion Outlook non trouvée');
    await this.enforceSyncRateLimit(connection);

    const token = await this.refreshMicrosoftTokenIfNeeded(connection);
    const headers = { Authorization: `Bearer ${token}` };

    onProgress({ percent: 5 });
    const foldersRes = await axios.get<{ value: OutlookFolder[] }>(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$top=50',
      { headers },
    );
    const ostiaFolder = foldersRes.data.value?.find(
      (f) => f.displayName?.toLowerCase() === OSTIA_LABEL.toLowerCase(),
    );

    if (!ostiaFolder?.id)
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        aiUnavailable: 0,
        labelMissing: true,
      };

    const cutoff = this.getSyncCutoffDate();
    const allMessages: OutlookMessage[] = [];
    let messagesUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${ostiaFolder.id}/messages` +
      `?$top=100&$select=subject,body,internetMessageId,receivedDateTime,conversationId,from` +
      `&$filter=${encodeURIComponent(`receivedDateTime ge ${cutoff.toISOString()}`)}`;
    while (messagesUrl) {
      const page: {
        data: { value: OutlookMessage[]; '@odata.nextLink'?: string };
      } = await axios.get(messagesUrl, { headers });
      allMessages.push(...(page.data.value ?? []));
      messagesUrl = page.data['@odata.nextLink'];
    }

    const messages = allMessages.sort(
      (a, b) =>
        new Date(a.receivedDateTime ?? 0).getTime() -
        new Date(b.receivedDateTime ?? 0).getTime(),
    );
    const total = messages.length;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let aiUnavailable = 0;
    const user = { id: userId } as User;

    onProgress({ percent: 15 });

    const syncStartedAt = Date.now();
    const estimateEta = this.createEtaEstimator(syncStartedAt);
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      onProgress({
        percent: 15 + Math.round(((i + 1) / total) * 70),
        current: i + 1,
        total,
        estimatedSecondsRemaining: estimateEta(i, total),
      });

      const subject = msg.subject ?? '';
      const body = msg.body?.content ?? '';
      const msgId = msg.internetMessageId ?? msg.id ?? '';
      const threadId = msg.conversationId;
      const from = this.extractEmailAddress(
        msg.from?.emailAddress?.address ?? '',
      );

      const existingRecord = await this.syncRecordsService.find(
        userId,
        EmailProvider.OUTLOOK,
        msgId,
      );
      if (this.syncRecordsService.shouldSkip(existingRecord)) {
        skipped++;
        continue;
      }

      const isSelfSent = !!from && from === connection.email.toLowerCase();
      const cleanBody = this.stripHtml(body);
      const freshBody = stripQuotedReply(cleanBody);
      const fullText = `${subject} ${cleanBody}`;
      const keywordStatus = isSelfSent
        ? null
        : detectStatusByKeywords(`${subject} ${freshBody}`);

      const byEmailId = await this.applicationsService.findByEmailId(
        userId,
        msgId,
      );
      if (byEmailId) {
        if (!byEmailId.emailBody && body) {
          await this.applicationsService.update(userId, byEmailId.id, {
            emailSubject: subject,
            emailBody: body.slice(0, 50000),
          });
        }
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: byEmailId.id },
        );
        skipped++;
        continue;
      }

      const dossier = await this.applicationsService.findDossierForEmail(
        userId,
        { threadId, text: fullText },
      );

      if (dossier) {
        if (dossier.status === ApplicationStatus.REJECTED) {
          await this.syncRecordsService.upsert(
            userId,
            EmailProvider.OUTLOOK,
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
        } else if (keywordStatus) {
          newStatus = keywordStatus;
        } else {
          await this.sleep(AI_REQUEST_DELAY_MS);
          newStatus = (await this.aiService.detectStatusUpdate(
            subject,
            freshBody,
            dossier.company,
            dossier.jobTitle,
            dossier.status,
          )) as ApplicationStatus | null;
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
          await this.applicationsService.update(userId, dossier.id, updates);
        }
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.DUPLICATE,
          { applicationId: dossier.id },
        );
        if (statusChanged) updated++;
        else skipped++;
        continue;
      }

      if (isSelfSent) {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: 'Self-sent message' },
        );
        failed++;
        continue;
      }

      await this.sleep(AI_REQUEST_DELAY_MS);
      const parseResult = await this.aiService.parseEmailForApplication(
        subject,
        cleanBody,
        msgId,
      );

      if (parseResult.kind === 'not-relevant') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: parseResult.reason },
        );
        failed++;
        continue;
      }

      if (parseResult.kind === 'unavailable') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: parseResult.reason },
        );
        aiUnavailable++;
        continue;
      }

      if (parseResult.kind === 'failed') {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: parseResult.reason },
        );
        failed++;
        continue;
      }

      const parsed = parseResult.data;

      if (!parsed.company || !parsed.jobTitle) {
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.NOT_RELEVANT,
          { reason: 'Missing company or jobTitle' },
        );
        failed++;
        continue;
      }

      try {
        const dto: CreateApplicationDto = {
          company: parsed.company,
          jobTitle: parsed.jobTitle,
          status: (keywordStatus ?? parsed.status) as ApplicationStatus,
          source: ApplicationSource.EMAIL,
          emailSubject: subject,
          emailBody: body.slice(0, 50000),
          emailId: msgId,
          threadId,
          location: parsed.location ?? undefined,
          appliedAt: parsed.appliedAt ?? undefined,
          notes: parsed.notes ?? undefined,
        };
        const app = await this.applicationsService.create(user, dto);
        created++;
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.CREATED,
          { applicationId: app.id },
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[OutlookSync] Failed to create application for message ${msgId}: ${errMsg}`,
        );
        await this.syncRecordsService.upsert(
          userId,
          EmailProvider.OUTLOOK,
          msgId,
          EmailSyncStatus.FAILED,
          { reason: errMsg },
        );
        failed++;
      }
    }

    return {
      synced: messages.length,
      created,
      updated,
      skipped,
      failed,
      aiUnavailable,
    };
  }

  private async refreshMicrosoftTokenIfNeeded(
    connection: EmailConnection,
  ): Promise<string> {
    const isExpired =
      connection.tokenExpiresAt && connection.tokenExpiresAt < new Date();
    if (!isExpired)
      return this.encryptionService.decrypt(connection.accessToken);

    const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>(
      'MICROSOFT_CLIENT_SECRET',
    )!;
    const tenant = this.configService.get<string>(
      'MICROSOFT_TENANT_ID',
      'common',
    );

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: this.encryptionService.decrypt(connection.refreshToken),
      grant_type: 'refresh_token',
    });

    const res = await axios.post<MicrosoftTokenResponse>(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    connection.accessToken = this.encryptionService.encrypt(
      res.data.access_token,
    );
    connection.tokenExpiresAt = new Date(
      Date.now() + res.data.expires_in * 1000,
    );
    await this.connectionRepo.save(connection);

    return res.data.access_token;
  }

  async updateGmailLabelForEmail(
    userId: string,
    emailId: string,
    status: ApplicationStatus,
  ): Promise<void> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) return;

    this.googleOAuth2Client.setCredentials({
      access_token: this.encryptionService.decrypt(connection.accessToken),
      ...(connection.refreshToken
        ? {
            refresh_token: this.encryptionService.decrypt(
              connection.refreshToken,
            ),
          }
        : {}),
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: this.googleOAuth2Client,
    });
    const labelMap = await this.ensureOstiaLabels(gmail);
    await this.applyGmailSublabel(gmail, emailId, status, labelMap);
  }

  async getConnections(
    userId: string,
  ): Promise<Array<EmailConnection & { nextSyncAvailableAt: string | null }>> {
    const connections = await this.connectionRepo.find({
      where: { user: { id: userId } },
    });
    return connections.map((connection) => ({
      ...connection,
      nextSyncAvailableAt: this.computeNextSyncAvailableAt(
        connection.lastSyncedAt,
      ),
    }));
  }

  async disconnect(userId: string, connectionId: string): Promise<void> {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, user: { id: userId } },
    });
    if (!conn) throw new NotFoundException('Connexion non trouvée');
    await this.connectionRepo.remove(conn);
  }

  async resetGmailData(userId: string): Promise<{
    applicationsRemoved: number;
    syncRecordsRemoved: number;
    labelsStripped: number;
    labelsRemaining: number;
  }> {
    const result = await this.resetProviderData(userId, EmailProvider.GMAIL);
    const { stripped, remaining } = await this.stripGmailSublabels(userId);
    return {
      ...result,
      labelsStripped: stripped,
      labelsRemaining: remaining,
    };
  }

  private async listGmailMessageIds(
    gmail: gmail_v1.Gmail,
    labelIds: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds,
        maxResults: 100,
        pageToken,
      });
      ids.push(
        ...(res.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => !!id),
      );
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return ids;
  }

  private async stripGmailSublabels(
    userId: string,
  ): Promise<{ stripped: number; remaining: number }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) return { stripped: 0, remaining: 0 };

    this.googleOAuth2Client.setCredentials({
      access_token: this.encryptionService.decrypt(connection.accessToken),
      ...(connection.refreshToken
        ? {
            refresh_token: this.encryptionService.decrypt(
              connection.refreshToken,
            ),
          }
        : {}),
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: this.googleOAuth2Client,
    });
    const labelMap = await this.ensureOstiaLabels(gmail);
    const sublabelIds = OSTIA_SUBLABELS.map((sub) =>
      labelMap.get(`${OSTIA_LABEL}/${sub}`),
    ).filter((id): id is string => !!id);
    if (sublabelIds.length === 0) return { stripped: 0, remaining: 0 };

    const collectLabeledIds = async (): Promise<string[]> => {
      const ids = new Set<string>();
      for (const subLabelId of sublabelIds) {
        (await this.listGmailMessageIds(gmail, [subLabelId])).forEach((id) =>
          ids.add(id),
        );
      }
      return Array.from(ids);
    };

    const stripIds = async (ids: string[]): Promise<number> => {
      let ok = 0;
      for (const id of ids) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id,
            requestBody: { removeLabelIds: sublabelIds },
          });
          ok++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[EmailReset] Failed to strip sublabels from message ${id}: ${msg}`,
          );
        }
      }
      return ok;
    };

    let stripped = await stripIds(await collectLabeledIds());

    let remainingIds = await collectLabeledIds();
    if (remainingIds.length > 0) {
      stripped += await stripIds(remainingIds);
      remainingIds = await collectLabeledIds();
    }

    return { stripped, remaining: remainingIds.length };
  }

  async resetOutlookData(
    userId: string,
  ): Promise<{ applicationsRemoved: number; syncRecordsRemoved: number }> {
    return this.resetProviderData(userId, EmailProvider.OUTLOOK);
  }

  private async resetProviderData(
    userId: string,
    provider: EmailProvider,
  ): Promise<{ applicationsRemoved: number; syncRecordsRemoved: number }> {
    const applicationsRemoved =
      await this.applicationsService.removeAllEmailSourced(userId);
    const records = await this.syncRecordsService.findAllForProvider(
      userId,
      provider,
    );
    const syncRecordsRemoved =
      await this.syncRecordsService.removeRecords(records);
    return { applicationsRemoved, syncRecordsRemoved };
  }
}
