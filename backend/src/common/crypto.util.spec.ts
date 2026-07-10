import * as crypto from 'crypto';
import {
  encryptString,
  decryptString,
  hmacEmail,
  isEncrypted,
} from './crypto.util';

describe('crypto.util', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a plaintext string', () => {
    const ciphertext = encryptString('hello world');
    expect(decryptString(ciphertext)).toBe('hello world');
  });

  it('round-trips a JSON-stringified object', () => {
    const payload = JSON.stringify({
      firstName: 'Ada',
      skills: ['TypeScript'],
    });
    const ciphertext = encryptString(payload);
    expect(JSON.parse(decryptString(ciphertext))).toEqual({
      firstName: 'Ada',
      skills: ['TypeScript'],
    });
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptString('same input');
    const b = encryptString('same input');
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe('same input');
    expect(decryptString(b)).toBe('same input');
  });

  it('tags encrypted values with the enc: prefix', () => {
    expect(isEncrypted(encryptString('x'))).toBe(true);
    expect(isEncrypted('plain text')).toBe(false);
  });

  it('returns non-encrypted values unchanged when decrypting (legacy plaintext)', () => {
    expect(decryptString('plain text')).toBe('plain text');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const ciphertext = encryptString('sensitive value');
    const [prefix, iv, tag, data] = ciphertext.split(':');
    const tamperedTag =
      tag.slice(0, -2) + (tag.slice(-2) === '00' ? '01' : '00');
    const tampered = `${prefix}:${iv}:${tamperedTag}:${data}`;
    expect(() => decryptString(tampered)).toThrow();
  });

  it('produces a deterministic hash for the same email', () => {
    expect(hmacEmail('user@example.com')).toBe(hmacEmail('user@example.com'));
  });

  it('produces a different hash for a different-case email', () => {
    expect(hmacEmail('user@example.com')).not.toBe(
      hmacEmail('USER@example.com'),
    );
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    await jest.isolateModulesAsync(async () => {
      const previous = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      const fresh = await import('./crypto.util');
      expect(() => fresh.encryptString('x')).toThrow();
      process.env.ENCRYPTION_KEY = previous;
    });
  });

  it('throws when ENCRYPTION_KEY has the wrong length', async () => {
    await jest.isolateModulesAsync(async () => {
      const previous = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'too-short';
      const fresh = await import('./crypto.util');
      expect(() => fresh.encryptString('x')).toThrow();
      process.env.ENCRYPTION_KEY = previous;
    });
  });
});
