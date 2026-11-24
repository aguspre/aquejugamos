import { randomBytes } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomFromAlphabet(length: number): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return result;
}

export function generateGroupInviteCode(groupName: string): string {
  const prefix = groupName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);

  return `${prefix || 'MESA'}-${randomFromAlphabet(4)}`;
}

export function generateSessionInviteToken(): string {
  return randomBytes(12).toString('base64url');
}
