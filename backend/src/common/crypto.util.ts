import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const PREFIX = 'enc:';

let cachedKey: Buffer | undefined;

function decodeKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }
  throw new Error(
    'ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.',
  );
}

export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is required and must be a 32-byte key encoded as 64 hex characters or base64.',
    );
  }

  cachedKey = decodeKey(raw);
  return cachedKey;
}

export function encryptString(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptString(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    return ciphertext;
  }
  const key = getEncryptionKey();
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function hmacEmail(email: string): string {
  return crypto
    .createHmac('sha256', getEncryptionKey())
    .update(email)
    .digest('hex');
}
