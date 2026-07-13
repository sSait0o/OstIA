import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const PREFIX = 'enc:';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly logger = new Logger(EncryptionService.name);

  constructor(private readonly configService: ConfigService) {
    const encKey = this.configService.get<string>('ENCRYPTION_KEY');
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    if (!encKey && jwtSecret && isProduction) {
      this.logger.warn(
        'ENCRYPTION_KEY is not set — falling back to JWT_SECRET for encryption. Set a dedicated ENCRYPTION_KEY in production.',
      );
    }

    const secret = encKey || jwtSecret;
    if (!secret) {
      if (isProduction) {
        throw new Error(
          'ENCRYPTION_KEY (or JWT_SECRET) must be set in production — refusing to start with an unencrypted fallback key.',
        );
      }
      this.logger.warn(
        'ENCRYPTION_KEY is not set — using an insecure dev-only key. Never use this in production.',
      );
    }

    this.key = crypto
      .createHash('sha256')
      .update(secret || 'fallback-dev-only-key-change-me')
      .digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(PREFIX)) return ciphertext;
    const parts = ciphertext.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return ciphertext;
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}
