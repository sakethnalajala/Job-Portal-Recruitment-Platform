import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function uuid(): string {
  return randomUUID();
}
