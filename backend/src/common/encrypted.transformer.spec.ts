import * as crypto from 'crypto';
import {
  encryptedStringTransformer,
  encryptedJsonTransformer,
} from './encrypted.transformer';

describe('encrypted.transformer', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  });

  describe('encryptedStringTransformer', () => {
    it('encrypts on to() and decrypts on from()', () => {
      const stored = encryptedStringTransformer.to('plain value') as string;
      expect(stored).not.toBe('plain value');
      expect(encryptedStringTransformer.from(stored)).toBe('plain value');
    });

    it('passes through null and undefined unchanged', () => {
      expect(encryptedStringTransformer.to(null)).toBeNull();
      expect(encryptedStringTransformer.from(null)).toBeNull();
      expect(encryptedStringTransformer.to(undefined)).toBeUndefined();
    });
  });

  describe('encryptedJsonTransformer', () => {
    it('serializes, encrypts, decrypts and parses round-trip', () => {
      const payload = { role: 'Data Analyst', years: 3 };
      const stored = encryptedJsonTransformer.to(payload) as string;
      expect(typeof stored).toBe('string');
      expect(encryptedJsonTransformer.from(stored)).toEqual(payload);
    });

    it('passes through null unchanged', () => {
      expect(encryptedJsonTransformer.to(null)).toBeNull();
      expect(encryptedJsonTransformer.from(null)).toBeNull();
    });
  });
});
