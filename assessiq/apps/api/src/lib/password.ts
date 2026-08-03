import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Password hashing via Node's built-in scrypt — no external dependency.
// Format stored in User.password_hash: "<salt-hex>:<hash-hex>".

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const hashBuf = Buffer.from(hashHex, 'hex');
  const testBuf = scryptSync(password, salt, 64);
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}
