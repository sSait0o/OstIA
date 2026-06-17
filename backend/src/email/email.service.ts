import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import axios from 'axios';
import { EmailConnection, EmailProvider } from './entities/email-connection.entity';
import { User } from '../users/entities/user.entity';
import { AiService } from '../ai/ai.service';
import { ApplicationsService } from '../applications/applications.service';
import { ApplicationSource } from '../applications/entities/application.entity';

const OSTIA_LABEL = 'Ostia';

@Injectable()
export class EmailService {
  private readonly googleOAuth2Client;

  constructor(
    @InjectRepository(EmailConnection)
    private readonly connectionRepo: Repository<EmailConnection>,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly applicationsService: ApplicationsService,
  ) {
    this.googleOAuth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_REDIRECT_URI'),
    );
  }

  // ─── Google ────────────────────────────────────────────────────────────────

  getGoogleAuthUrl(userId: string): string {
    return this.googleOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      state: userId,
    });
  }

  async handleGoogleCallback(code: string, userId: string): Promise<EmailConnection> {
    const { tokens } = await this.googleOAuth2Client.getToken(code);
    this.googleOAuth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: this.googleOAuth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const existing = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });

    const connection = existing ?? this.connectionRepo.create({
      user: { id: userId } as User,
      provider: EmailProvider.GMAIL,
    });

    connection.email = profile.data.emailAddress ?? '';
    connection.accessToken = tokens.access_token!;
    connection.refreshToken = tokens.refresh_token ?? connection.refreshToken;
    if (tokens.expiry_date) connection.tokenExpiresAt = new Date(tokens.expiry_date);
    connection.isActive = true;

    return this.connectionRepo.save(connection);
  }

  async syncGmailEmails(userId: string): Promise<{ synced: number; created: number }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.GMAIL },
    });
    if (!connection) throw new NotFoundException('Connexion Gmail non trouvée');

    this.googleOAuth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: this.googleOAuth2Client });

    const labels = await gmail.users.labels.list({ userId: 'me' });
    const ostiaLabel = labels.data.labels?.find(
      (l) => l.name?.toLowerCase() === OSTIA_LABEL.toLowerCase(),
    );

    if (!ostiaLabel?.id) return { synced: 0, created: 0 };

    const messages = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [ostiaLabel.id],
      maxResults: 50,
    });

    if (!messages.data.messages) return { synced: 0, created: 0 };

    let created = 0;
    const user = { id: userId } as User;

    for (const msg of messages.data.messages) {
      if (!msg.id) continue;
      const full: any = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers: Array<{ name?: string; value?: string }> = full.data?.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
      const body = this.extractGmailBody(full.data?.payload);

      const parsed = await this.aiService.parseEmailForApplication(subject, body, msg.id);
      if (parsed) {
        try {
          await this.applicationsService.create(user, { ...parsed, source: ApplicationSource.EMAIL });
          created++;
        } catch {
        }
      }
    }

    return { synced: messages.data.messages.length, created };
  }

  private extractGmailBody(payload: any): string {
    if (!payload) return '';
    if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }
    return '';
  }

  // ─── Microsoft ─────────────────────────────────────────────────────────────

  getMicrosoftAuthUrl(userId: string): string {
    const clientId = this.configService.get('MICROSOFT_CLIENT_ID');
    const redirectUri = this.configService.get('MICROSOFT_REDIRECT_URI');
    const tenant = this.configService.get('MICROSOFT_TENANT_ID', 'common');
    const scope = encodeURIComponent('offline_access Mail.Read');
    return (
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
      `?client_id=${clientId}&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}&state=${userId}`
    );
  }

  async handleMicrosoftCallback(code: string, userId: string): Promise<EmailConnection> {
    const clientId = this.configService.get('MICROSOFT_CLIENT_ID')!;
    const clientSecret = this.configService.get('MICROSOFT_CLIENT_SECRET')!;
    const redirectUri = this.configService.get('MICROSOFT_REDIRECT_URI')!;
    const tenant = this.configService.get('MICROSOFT_TENANT_ID', 'common');

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const profileRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const email: string = profileRes.data.mail ?? profileRes.data.userPrincipalName ?? '';

    const existing = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.OUTLOOK },
    });

    const connection = existing ?? this.connectionRepo.create({
      user: { id: userId } as User,
      provider: EmailProvider.OUTLOOK,
    });

    connection.email = email;
    connection.accessToken = access_token;
    connection.refreshToken = refresh_token ?? connection.refreshToken;
    connection.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    connection.isActive = true;

    return this.connectionRepo.save(connection);
  }

  async syncOutlookEmails(userId: string): Promise<{ synced: number; created: number }> {
    const connection = await this.connectionRepo.findOne({
      where: { user: { id: userId }, provider: EmailProvider.OUTLOOK },
    });
    if (!connection) throw new NotFoundException('Connexion Outlook non trouvée');

    const token = await this.refreshMicrosoftTokenIfNeeded(connection);
    const headers = { Authorization: `Bearer ${token}` };

    const foldersRes = await axios.get(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$top=50',
      { headers },
    );
    const ostiaFolder = foldersRes.data.value?.find(
      (f: any) => f.displayName?.toLowerCase() === OSTIA_LABEL.toLowerCase(),
    );

    if (!ostiaFolder) return { synced: 0, created: 0 };

    const messagesRes = await axios.get(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${ostiaFolder.id}/messages` +
      `?$top=50&$select=subject,body,internetMessageId,receivedDateTime`,
      { headers },
    );

    const messages: any[] = messagesRes.data.value ?? [];
    let created = 0;
    const user = { id: userId } as User;

    for (const msg of messages) {
      const subject: string = msg.subject ?? '';
      const body: string = msg.body?.content ?? '';
      const msgId: string = msg.internetMessageId ?? msg.id;

      const parsed = await this.aiService.parseEmailForApplication(subject, body, msgId);
      if (parsed) {
        try {
          await this.applicationsService.create(user, { ...parsed, source: ApplicationSource.EMAIL });
          created++;
        } catch {
        }
      }
    }

    return { synced: messages.length, created };
  }

  private async refreshMicrosoftTokenIfNeeded(connection: EmailConnection): Promise<string> {
    const isExpired = connection.tokenExpiresAt && connection.tokenExpiresAt < new Date();
    if (!isExpired) return connection.accessToken;

    const clientId = this.configService.get('MICROSOFT_CLIENT_ID')!;
    const clientSecret = this.configService.get('MICROSOFT_CLIENT_SECRET')!;
    const tenant = this.configService.get('MICROSOFT_TENANT_ID', 'common');

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await axios.post(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    connection.accessToken = res.data.access_token;
    connection.tokenExpiresAt = new Date(Date.now() + res.data.expires_in * 1000);
    await this.connectionRepo.save(connection);

    return connection.accessToken;
  }

  // ─── Commun ────────────────────────────────────────────────────────────────

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
