import { Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { ApplicationStatus } from '@applications/entities/application.entity';
import { EmailProvider } from '../entities/email-connection.entity';
import { extractEmailAddress } from './email-sync.engine';
import {
  EmailSyncProvider,
  NormalizedEmailMessage,
  OSTIA_LABEL,
} from './email-sync.types';

const GMAIL_FETCH_CONCURRENCY = 10;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const current = items[nextIndex++];
        const result = await fn(current);
        if (result !== null) results.push(result);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

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

export async function ensureOstiaLabels(
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

export async function applyGmailSublabel(
  gmail: gmail_v1.Gmail,
  msgId: string,
  status: ApplicationStatus,
  labelMap: Map<string, string>,
  logger: Logger,
): Promise<void> {
  const sublabel = STATUS_TO_SUBLABEL[status];

  if (!sublabel) {
    const sublabelIds = OSTIA_SUBLABELS.map((sub) =>
      labelMap.get(`${OSTIA_LABEL}/${sub}`),
    );
    const allOstiaLabelIds = [labelMap.get(OSTIA_LABEL), ...sublabelIds].filter(
      (id): id is string => !!id,
    );
    if (allOstiaLabelIds.length === 0) return;
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: msgId,
        requestBody: { removeLabelIds: allOstiaLabelIds },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
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
    logger.warn(
      `[EmailSync] Failed to apply label to message ${msgId}: ${msg}`,
    );
  }
}

export async function listGmailMessageIds(
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

export async function stripGmailSublabels(
  gmail: gmail_v1.Gmail,
  labelMap: Map<string, string>,
  logger: Logger,
): Promise<{ stripped: number; remaining: number }> {
  const sublabelIds = OSTIA_SUBLABELS.map((sub) =>
    labelMap.get(`${OSTIA_LABEL}/${sub}`),
  ).filter((id): id is string => !!id);
  if (sublabelIds.length === 0) return { stripped: 0, remaining: 0 };

  const collectLabeledIds = async (): Promise<string[]> => {
    const ids = new Set<string>();
    for (const subLabelId of sublabelIds) {
      (await listGmailMessageIds(gmail, [subLabelId])).forEach((id) =>
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
        logger.warn(
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

function extractGmailBody(
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
        const nested = extractGmailBody(part);
        if (nested) return nested;
      }
    }
    return plainText;
  }
  return '';
}

export class GmailSyncProvider implements EmailSyncProvider {
  readonly provider = EmailProvider.GMAIL;
  readonly logTag = '[EmailSync]';

  constructor(
    private readonly gmail: gmail_v1.Gmail,
    private readonly labelMap: Map<string, string>,
    private readonly logger: Logger,
  ) {}

  async fetchMessages(
    cutoff: Date,
    maxMessages?: number,
  ): Promise<NormalizedEmailMessage[]> {
    const ostiaLabelId = this.labelMap.get(OSTIA_LABEL)!;
    const cutoffQuery = `after:${cutoff.getFullYear()}/${String(
      cutoff.getMonth() + 1,
    ).padStart(2, '0')}/${String(cutoff.getDate()).padStart(2, '0')}`;

    const allMessages: gmail_v1.Schema$Message[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.gmail.users.messages.list({
        userId: 'me',
        labelIds: [ostiaLabelId],
        q: cutoffQuery,
        maxResults: 100,
        pageToken,
      });
      allMessages.push(...(page.data.messages ?? []));
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken);

    let msgList = allMessages.filter((m) => !!m.id);
    if (maxMessages && msgList.length > maxMessages) {
      msgList = msgList.slice(0, maxMessages);
    }

    const fetched = await mapWithConcurrency(
      msgList,
      GMAIL_FETCH_CONCURRENCY,
      async (msg): Promise<NormalizedEmailMessage | null> => {
        try {
          const full = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'full',
          });
          const headers: gmail_v1.Schema$MessagePartHeader[] =
            full.data?.payload?.headers ?? [];
          const subject =
            headers.find((h) => h.name === 'Subject')?.value ?? '';
          const from = extractEmailAddress(
            headers.find((h) => h.name === 'From')?.value ?? '',
          );
          const body = extractGmailBody(full.data?.payload);
          const threadId = full.data?.threadId ?? undefined;
          const internalDate = Number(full.data?.internalDate ?? 0);
          return {
            msgId: msg.id!,
            subject,
            from,
            body,
            threadId,
            receivedAt: internalDate ? new Date(internalDate) : null,
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[EmailSync] Failed to fetch message ${msg.id}: ${errMsg}`,
          );
          return null;
        }
      },
    );
    fetched.sort(
      (a, b) => (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0),
    );
    return fetched;
  }

  async applyLabel(msgId: string, status: ApplicationStatus): Promise<void> {
    await applyGmailSublabel(
      this.gmail,
      msgId,
      status,
      this.labelMap,
      this.logger,
    );
  }
}

export async function createGmailSyncProvider(
  gmail: gmail_v1.Gmail,
  logger: Logger,
): Promise<GmailSyncProvider | null> {
  const labelMap = await ensureOstiaLabels(gmail);
  if (!labelMap.get(OSTIA_LABEL)) return null;
  return new GmailSyncProvider(gmail, labelMap, logger);
}
