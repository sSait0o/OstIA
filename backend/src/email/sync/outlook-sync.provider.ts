import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ApplicationStatus } from '@applications/entities/application.entity';
import {
  EmailConnection,
  EmailProvider,
} from '../entities/email-connection.entity';
import { EncryptionService } from '@common/encryption.service';
import { extractEmailAddress } from './email-sync.engine';
import {
  EmailSyncProvider,
  NormalizedEmailMessage,
  OSTIA_LABEL,
} from './email-sync.types';

export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface MicrosoftProfile {
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

export async function exchangeMicrosoftAuthCode(
  code: string,
  configService: ConfigService,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  email: string;
}> {
  const clientId = configService.get<string>('MICROSOFT_CLIENT_ID')!;
  const clientSecret = configService.get<string>('MICROSOFT_CLIENT_SECRET')!;
  const redirectUri = configService.get<string>('MICROSOFT_REDIRECT_URI')!;
  const tenant = configService.get<string>('MICROSOFT_TENANT_ID', 'common');

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
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  const email = profileRes.data.mail ?? profileRes.data.userPrincipalName ?? '';

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresIn: expires_in,
    email,
  };
}

export async function refreshMicrosoftTokenIfNeeded(
  connection: EmailConnection,
  configService: ConfigService,
  encryptionService: EncryptionService,
  connectionRepo: Repository<EmailConnection>,
): Promise<string> {
  const isExpired =
    connection.tokenExpiresAt && connection.tokenExpiresAt < new Date();
  if (!isExpired) return encryptionService.decrypt(connection.accessToken);

  const clientId = configService.get<string>('MICROSOFT_CLIENT_ID')!;
  const clientSecret = configService.get<string>('MICROSOFT_CLIENT_SECRET')!;
  const tenant = configService.get<string>('MICROSOFT_TENANT_ID', 'common');

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: encryptionService.decrypt(connection.refreshToken),
    grant_type: 'refresh_token',
  });

  const res = await axios.post<MicrosoftTokenResponse>(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  connection.accessToken = encryptionService.encrypt(res.data.access_token);
  connection.tokenExpiresAt = new Date(Date.now() + res.data.expires_in * 1000);
  await connectionRepo.save(connection);

  return res.data.access_token;
}

export class OutlookSyncProvider implements EmailSyncProvider {
  readonly provider = EmailProvider.OUTLOOK;
  readonly logTag = '[OutlookSync]';

  constructor(
    private readonly headers: Record<string, string>,
    private readonly folderId: string,
  ) {}

  async fetchMessages(cutoff: Date): Promise<NormalizedEmailMessage[]> {
    const allMessages: OutlookMessage[] = [];
    let messagesUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${this.folderId}/messages` +
      `?$top=100&$select=subject,body,internetMessageId,receivedDateTime,conversationId,from` +
      `&$filter=${encodeURIComponent(`receivedDateTime ge ${cutoff.toISOString()}`)}`;
    while (messagesUrl) {
      const page: {
        data: { value: OutlookMessage[]; '@odata.nextLink'?: string };
      } = await axios.get(messagesUrl, { headers: this.headers });
      allMessages.push(...(page.data.value ?? []));
      messagesUrl = page.data['@odata.nextLink'];
    }

    return allMessages
      .map(
        (msg): NormalizedEmailMessage => ({
          msgId: msg.internetMessageId ?? msg.id ?? '',
          subject: msg.subject ?? '',
          body: msg.body?.content ?? '',
          threadId: msg.conversationId,
          receivedAt: msg.receivedDateTime
            ? new Date(msg.receivedDateTime)
            : null,
          from: extractEmailAddress(msg.from?.emailAddress?.address ?? ''),
        }),
      )
      .sort(
        (a, b) =>
          (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0),
      );
  }

  async applyLabel(_msgId: string, _status: ApplicationStatus): Promise<void> {
    // Outlook n'a pas d'équivalent aux sous-libellés Gmail : rien à appliquer.
  }
}

export async function createOutlookSyncProvider(
  headers: Record<string, string>,
): Promise<OutlookSyncProvider | null> {
  const foldersRes = await axios.get<{ value: OutlookFolder[] }>(
    'https://graph.microsoft.com/v1.0/me/mailFolders?$top=50',
    { headers },
  );
  const ostiaFolder = foldersRes.data.value?.find(
    (f) => f.displayName?.toLowerCase() === OSTIA_LABEL.toLowerCase(),
  );
  if (!ostiaFolder?.id) return null;
  return new OutlookSyncProvider(headers, ostiaFolder.id);
}
