import { Injectable, NotFoundException } from '@nestjs/common';
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
import { User } from '../users/entities/user.entity';
import { AiService } from '../ai/ai.service';
import { ApplicationsService } from '../applications/applications.service';
import {
  ApplicationSource,
  ApplicationStatus,
} from '../applications/entities/application.entity';
import { CreateApplicationDto } from '../applications/dto/create-application.dto';
import { EncryptionService } from '../common/encryption.service';

export interface SyncProgress {
  percent: number;
  done?: boolean;
  synced?: number;
  created?: number;
  skipped?: number;
  failed?: number;
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
}

const OSTIA_LABEL = 'OstIA';
const OSTIA_SUBLABELS = [
  'Accepté',
  'Archivé',
  'Autre',
  'Entretien',
  'Envoyé',
  'Refus',
];

const STATUS_TO_SUBLABEL: Partial<Record<ApplicationStatus, string>> = {
  [ApplicationStatus.APPLIED]: 'Envoyé',
  [ApplicationStatus.ACKNOWLEDGED]: 'Archivé',
  [ApplicationStatus.TECHNICAL]: 'Autre',
  [ApplicationStatus.INTERVIEW]: 'Entretien',
  [ApplicationStatus.OFFER]: 'Accepté',
  [ApplicationStatus.REJECTED]: 'Refus',
};

@Injectable()
export class EmailService {
  private readonly googleOAuth2Client: OAuth2Client;

  constructor(
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly aiService: AiService,
    private readonly applicationsService: ApplicationsService,
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

  async syncGmailEmails(userId: string): Promise<{
    synced: number;
    created: number;
    skipped: number;
    failed: number;
  }> {
    return this.doGmailSync(userId, () => {});
  }

  syncGmailStream(userId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const emit = (data: SyncProgress) =>
        subscriber.next({ data } as unknown as MessageEvent);

      this.doGmailSync(userId, emit)
        .then((result) => {
          emit({ percent: 100, done: true, ...result });
          subscriber.complete();
        })
        .catch((err: unknown) => subscriber.error(err));
    });
  }

  private async doGmailSync(
    userId: string,
    onProgress: (p: SyncProgress) => void,
  ): Promise<{
    synced: number;
    created: number;
    skipped: number;
    failed: number;
  }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) throw new NotFoundException('Connexion Gmail non trouvée');

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

    if (!ostiaLabelId) return { synced: 0, created: 0, skipped: 0, failed: 0 };

    const messages = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [ostiaLabelId],
      maxResults: 50,
    });

    if (!messages.data.messages)
      return { synced: 0, created: 0, skipped: 0, failed: 0 };

    const msgList = messages.data.messages.filter((m) => !!m.id);
    const total = msgList.length;
    let created = 0;
    let skipped = 0;
    let failed = 0;
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
        const body = this.extractGmailBody(full.data?.payload);
        return { msgId: msg.id!, subject, body };
      }),
    );
    onProgress({ percent: 15 });

    for (let i = 0; i < fetched.length; i++) {
      const { msgId, subject, body } = fetched[i];
      onProgress({ percent: 15 + Math.round(((i + 1) / total) * 70) });

      const existing = await this.applicationsService.findDuplicate(
        userId,
        msgId,
      );
      if (existing) {
        if (!existing.emailBody && body) {
          await this.applicationsService.update(userId, existing.id, {
            emailSubject: subject,
            emailBody: body.slice(0, 50000),
          });
        }
        await this.applyGmailSublabel(gmail, msgId, existing.status, labelMap);
        skipped++;
        continue;
      }

      const parsed = await this.aiService.parseEmailForApplication(
        subject,
        this.stripHtml(body),
        msgId,
      );

      if (!parsed || !parsed.company || !parsed.jobTitle) {
        failed++;
        continue;
      }

      const duplicate = await this.applicationsService.findDuplicate(
        userId,
        undefined,
        parsed.company,
        parsed.jobTitle,
      );

      if (duplicate) {
        if (!duplicate.emailBody && body) {
          await this.applicationsService.update(userId, duplicate.id, {
            emailSubject: subject,
            emailBody: body.slice(0, 50000),
          });
        }
        await this.applyGmailSublabel(gmail, msgId, duplicate.status, labelMap);
        skipped++;
        continue;
      }

      try {
        const dto: CreateApplicationDto = {
          company: parsed.company,
          jobTitle: parsed.jobTitle,
          status: parsed.status as ApplicationStatus,
          source: ApplicationSource.EMAIL,
          emailSubject: subject,
          emailBody: body.slice(0, 50000),
          location: parsed.location ?? undefined,
          appliedAt: parsed.appliedAt ?? undefined,
          notes: parsed.notes ?? undefined,
        };
        const app = await this.applicationsService.create(user, dto);
        created++;
        await this.applyGmailSublabel(gmail, msgId, app.status, labelMap);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[EmailSync] Failed to create application for message ${msgId}: ${msg}`,
        );
        failed++;
      }
    }

    return { synced: total, created, skipped, failed };
  }

  private async applyGmailSublabel(
    gmail: gmail_v1.Gmail,
    msgId: string,
    status: ApplicationStatus,
    labelMap: Map<string, string>,
  ): Promise<void> {
    const sublabel = STATUS_TO_SUBLABEL[status];
    if (!sublabel) return;
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
      console.warn(
        `[EmailSync] Failed to apply label to message ${msgId}: ${msg}`,
      );
    }
  }

  private async ensureOstiaLabels(
    gmail: gmail_v1.Gmail,
  ): Promise<Map<string, string>> {
    const labelMap = new Map<string, string>();
    const { data } = await gmail.users.labels.list({ userId: 'me' });
    const existingLabels: gmail_v1.Schema$Label[] = data.labels ?? [];

    let parentId = existingLabels.find((l) => l.name === OSTIA_LABEL)?.id;
    if (!parentId) {
      const res = await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name: OSTIA_LABEL },
      });
      parentId = res.data.id ?? undefined;
    }
    if (parentId) labelMap.set(OSTIA_LABEL, parentId);

    for (const sub of OSTIA_SUBLABELS) {
      const fullName = `${OSTIA_LABEL}/${sub}`;
      let labelId = existingLabels.find((l) => l.name === fullName)?.id;
      if (!labelId) {
        const res = await gmail.users.labels.create({
          userId: 'me',
          requestBody: { name: fullName },
        });
        labelId = res.data.id ?? undefined;
      }
      if (labelId) labelMap.set(fullName, labelId);
    }

    return labelMap;
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

  async syncOutlookEmails(userId: string): Promise<{
    synced: number;
    created: number;
    skipped: number;
    failed: number;
  }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.OUTLOOK },
    });
    if (!connection)
      throw new NotFoundException('Connexion Outlook non trouvée');

    const token = await this.refreshMicrosoftTokenIfNeeded(connection);
    const headers = { Authorization: `Bearer ${token}` };

    const foldersRes = await axios.get<{ value: OutlookFolder[] }>(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$top=50',
      { headers },
    );
    const ostiaFolder = foldersRes.data.value?.find(
      (f) => f.displayName?.toLowerCase() === OSTIA_LABEL.toLowerCase(),
    );

    if (!ostiaFolder?.id)
      return { synced: 0, created: 0, skipped: 0, failed: 0 };

    const messagesRes = await axios.get<{ value: OutlookMessage[] }>(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${ostiaFolder.id}/messages` +
        `?$top=50&$select=subject,body,internetMessageId,receivedDateTime`,
      { headers },
    );

    const messages = messagesRes.data.value ?? [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const user = { id: userId } as User;

    for (const msg of messages) {
      const subject = msg.subject ?? '';
      const body = msg.body?.content ?? '';
      const msgId = msg.internetMessageId ?? msg.id ?? '';

      const parsed = await this.aiService.parseEmailForApplication(
        subject,
        this.stripHtml(body),
        msgId,
      );
      if (!parsed) {
        failed++;
        continue;
      }

      const duplicate = await this.applicationsService.findDuplicate(
        userId,
        msgId,
        parsed.company,
        parsed.jobTitle,
      );

      if (duplicate) {
        if (!duplicate.emailBody && body) {
          await this.applicationsService.update(userId, duplicate.id, {
            emailSubject: subject,
            emailBody: body.slice(0, 50000),
          });
        }
        skipped++;
        continue;
      }

      try {
        const dto: CreateApplicationDto = {
          company: parsed.company,
          jobTitle: parsed.jobTitle,
          status: parsed.status as ApplicationStatus,
          source: ApplicationSource.EMAIL,
          emailSubject: subject,
          emailBody: body.slice(0, 50000),
          location: parsed.location ?? undefined,
          appliedAt: parsed.appliedAt ?? undefined,
          notes: parsed.notes ?? undefined,
        };
        await this.applicationsService.create(user, dto);
        created++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[OutlookSync] Failed to create application for message ${msgId}: ${errMsg}`,
        );
        failed++;
      }
    }

    return { synced: messages.length, created, skipped, failed };
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

  async getConnections(userId: string): Promise<EmailConnection[]> {
    return this.connectionRepo.find({ where: { user: { id: userId } } });
  }

  async disconnect(userId: string, connectionId: string): Promise<void> {
    const conn = await this.connectionRepo.findOne({
      where: { id: connectionId, user: { id: userId } },
    });
    if (!conn) throw new NotFoundException('Connexion non trouvée');
    await this.connectionRepo.remove(conn);
  }
}
