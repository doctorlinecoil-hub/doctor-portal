import 'server-only';
import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Readable temporary password (no 0/O, 1/l/I). The user must change it on first login. */
export function tempPassword(len = 12) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
