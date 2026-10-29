'use server';
import { signup, forgotPassword, resetPassword, type SignupInput } from '@/lib/accounts';

export async function registerAccount(input: SignupInput) {
  return signup(input);
}

export async function requestTempPassword(email: string) {
  return forgotPassword(email);
}

export async function setNewPassword(token: string, password: string) {
  return resetPassword(token, password);
}
