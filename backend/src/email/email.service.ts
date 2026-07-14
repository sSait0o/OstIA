import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { Observable } from 'rxjs';
import {
  EmailConnection,
  EmailProvider,
} from './entities/email-connection.entity';
import { EmailSyncRecordsService } from './email-sync-records.service';
import { User } from '@users/entities/user.entity';
import { AiService } from '@ai/ai.service';
import { ApplicationsService } from '@applications/applications.service';
import { ApplicationEmailsService } from '@applications/application-emails.service';
import { ApplicationStatus } from '@applications/entities/application.entity';
import { EncryptionService } from '@common/encryption.service';
import {
  SyncProgress,
  SyncRateLimitedException,
  SyncResult,
  SyncStatus,
} from './sync/email-sync.types';
import { EmailSyncDeps, runEmailSync } from './sync/email-sync.engine';
import {
  applyGmailSublabel,
  createGmailSyncProvider,
  ensureOstiaLabels,
  stripGmailSublabels,
} from './sync/gmail-sync.provider';
import {
  createOutlookSyncProvider,
  exchangeMicrosoftAuthCode,
  refreshMicrosoftTokenIfNeeded,
} from './sync/outlook-sync.provider';

const SYNC_BURST_LIMIT = 3;
const SYNC_COOLDOWN_MS = 20 * 60 * 60 * 1000;

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
    private readonly applicationEmailsService: ApplicationEmailsService,
  ) {
    this.googleOAuth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_REDIRECT_URI'),
    );
  }

  private syncDeps(): EmailSyncDeps {
    const maxMessagesRaw = this.configService.get<string>(
      'EMAIL_SYNC_MAX_MESSAGES',
    );
    return {
      logger: this.logger,
      syncRecordsService: this.syncRecordsService,
      applicationsService: this.applicationsService,
      applicationEmailsService: this.applicationEmailsService,
      aiService: this.aiService,
      maxMessages: maxMessagesRaw ? Number(maxMessagesRaw) : undefined,
    };
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

  private buildGmailClient(connection: EmailConnection): gmail_v1.Gmail {
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
    return google.gmail({ version: 'v1', auth: this.googleOAuth2Client });
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

    await ensureOstiaLabels(gmail);

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

  getSyncStatus(userId: string): SyncStatus {
    return {
      gmail:
        this.activeSyncs.get(this.syncKey(userId, EmailProvider.GMAIL)) ?? null,
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

    const gmail = this.buildGmailClient(connection);
    const provider = await createGmailSyncProvider(gmail, this.logger);
    if (!provider) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        aiUnavailable: 0,
        labelMissing: true,
      };
    }

    return runEmailSync(
      this.syncDeps(),
      provider,
      userId,
      connection.email,
      onProgress,
    );
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
    const { accessToken, refreshToken, expiresIn, email } =
      await exchangeMicrosoftAuthCode(code, this.configService);

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
    connection.accessToken = this.encryptionService.encrypt(accessToken);
    if (refreshToken)
      connection.refreshToken = this.encryptionService.encrypt(refreshToken);
    connection.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    connection.isActive = true;

    return this.connectionRepo.save(connection);
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

    const token = await refreshMicrosoftTokenIfNeeded(
      connection,
      this.configService,
      this.encryptionService,
      this.connectionRepo,
    );
    const headers = { Authorization: `Bearer ${token}` };
    const provider = await createOutlookSyncProvider(headers);
    if (!provider) {
      return {
        synced: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        aiUnavailable: 0,
        labelMissing: true,
      };
    }

    return runEmailSync(
      this.syncDeps(),
      provider,
      userId,
      connection.email,
      onProgress,
    );
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

    const gmail = this.buildGmailClient(connection);
    const labelMap = await ensureOstiaLabels(gmail);
    await applyGmailSublabel(gmail, emailId, status, labelMap, this.logger);
  }

  async getConnections(userId: string): Promise<
    Array<
      EmailConnection & {
        nextSyncAvailableAt: string | null;
        syncAttemptsRemaining: number;
      }
    >
  > {
    const connections = await this.connectionRepo.find({
      where: { user: { id: userId } },
    });
    return connections.map((connection) => {
      const availability = this.getSyncAvailability(connection);
      return {
        ...connection,
        nextSyncAvailableAt: availability.available
          ? null
          : new Date(Date.now() + availability.retryAfterMs).toISOString(),
        syncAttemptsRemaining: availability.attemptsRemaining,
      };
    });
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
    const { stripped, remaining } =
      await this.stripGmailSublabelsForUser(userId);
    return {
      ...result,
      labelsStripped: stripped,
      labelsRemaining: remaining,
    };
  }

  private async stripGmailSublabelsForUser(
    userId: string,
  ): Promise<{ stripped: number; remaining: number }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) return { stripped: 0, remaining: 0 };

    const gmail = this.buildGmailClient(connection);
    const labelMap = await ensureOstiaLabels(gmail);
    return stripGmailSublabels(gmail, labelMap, this.logger);
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

  private isSyncRateLimitEnabled(): boolean {
    return this.configService.get('NODE_ENV') === 'production';
  }

  private getSyncAvailability(connection: EmailConnection): {
    available: boolean;
    attemptsRemaining: number;
    retryAfterMs: number;
  } {
    if (!this.isSyncRateLimitEnabled() || !connection.lastSyncedAt) {
      return {
        available: true,
        attemptsRemaining: SYNC_BURST_LIMIT,
        retryAfterMs: 0,
      };
    }
    if (connection.syncAttemptCount < SYNC_BURST_LIMIT) {
      return {
        available: true,
        attemptsRemaining: SYNC_BURST_LIMIT - connection.syncAttemptCount,
        retryAfterMs: 0,
      };
    }
    const elapsed = Date.now() - connection.lastSyncedAt.getTime();
    if (elapsed >= SYNC_COOLDOWN_MS) {
      return {
        available: true,
        attemptsRemaining: SYNC_BURST_LIMIT,
        retryAfterMs: 0,
      };
    }
    return {
      available: false,
      attemptsRemaining: 0,
      retryAfterMs: SYNC_COOLDOWN_MS - elapsed,
    };
  }

  private async enforceSyncRateLimit(
    connection: EmailConnection,
  ): Promise<void> {
    const availability = this.getSyncAvailability(connection);
    if (!availability.available) {
      throw new SyncRateLimitedException(
        Math.ceil(availability.retryAfterMs / 1000),
      );
    }
    connection.syncAttemptCount =
      connection.syncAttemptCount >= SYNC_BURST_LIMIT
        ? 1
        : connection.syncAttemptCount + 1;
    connection.lastSyncedAt = new Date();
    await this.connectionRepo.save(connection);
  }
}
