import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Signs in with the one-time token from the email (POST from the confirm page only), then opens the right panel. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const tokenHash = String(form?.get('token_hash') || '');
  if (!tokenHash) return NextResponse.redirect(new URL('/login?e=link', url.origin), 303);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  return NextResponse.redirect(new URL(error ? '/login?e=link' : '/', url.origin), 303);
}
