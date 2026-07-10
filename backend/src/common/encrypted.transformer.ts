import { ValueTransformer } from 'typeorm';
import { decryptString, encryptString } from './crypto.util';

export const encryptedStringTransformer: ValueTransformer = {
  to: (value: string | null | undefined) =>
    value == null ? value : encryptString(value),
  from: (value: string | null | undefined) =>
    value == null ? value : decryptString(value),
};

export const encryptedJsonTransformer: ValueTransformer = {
  to: (value: Record<string, any> | null | undefined) =>
    value == null ? value : encryptString(JSON.stringify(value)),
  from: (
    value: string | null | undefined,
  ): Record<string, any> | null | undefined =>
    value == null
      ? value
      : (JSON.parse(decryptString(value)) as Record<string, any>),
};
