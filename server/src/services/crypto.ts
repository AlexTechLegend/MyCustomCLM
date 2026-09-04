import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { requireSecretKey } from '../config.js';

const ALGO = 'aes-256-gcm';

export function encryptSecretWithKey(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecretWithKey(ciphertext: string, iv: string, tag: string, key: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export function encryptSecret(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  return encryptSecretWithKey(plaintext, requireSecretKey());
}

export function decryptSecret(ciphertext: string, iv: string, tag: string): string {
  return decryptSecretWithKey(ciphertext, iv, tag, requireSecretKey());
}

/** Re-encrypt every credential under `newKey`. Call inside a transaction. */
export function reencryptSecret(ciphertext: string, iv: string, tag: string, oldKey: Buffer, newKey: Buffer) {
  const plain = decryptSecretWithKey(ciphertext, iv, tag, oldKey);
  return encryptSecretWithKey(plain, newKey);
}

/** scrypt password hash: salt$hex */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split('$');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, salt, expected.length);
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Timing-safe string compare via SHA-256 so length differences do not leak. */
export function safeEqualString(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
