import { randomBytes } from 'node:crypto';

// URL-safe alphabet (no ambiguous separators). 62 chars.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Cryptographically-random URL-safe token (default 10 chars) for share links.
export function generateToken(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
