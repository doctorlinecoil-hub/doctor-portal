'use server';
import { sendLoginCode } from '@/lib/accounts';

export async function requestLoginCode(email: string) {
  return sendLoginCode(email);
}
