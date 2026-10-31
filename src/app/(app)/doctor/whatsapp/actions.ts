'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendText } from '@/lib/whatsapp';

/** A reply from the conversations screen. WhatsApp allows free text only within 24 hours of the patient's last message. */
export async function replyWhatsapp(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return { ok: false, error: 'אין הרשאה.' };
  const p = String(phone || '').replace(/\D/g, '');
  const body = String(text || '').trim();
  if (!/^9725\d{8}$/.test(p) || !body) return { ok: false, error: 'חסר טקסט.' };
  const db = createAdminClient();
  const { data: last } = await db.from('wa_messages').select('created_at, appointment_id').eq('phone', p).eq('direction', 'in').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!last || Date.now() - new Date(last.created_at).getTime() > 24 * 3600_000) {
    return { ok: false, error: 'עברו יותר מ־24 שעות מההודעה האחרונה של המטופל. וואטסאפ מאפשר עכשיו רק הודעות מוכנות (זימון, תזכורת וכו׳), או שהמטופל יכתוב קודם.' };
  }
  const r = await sendText(db, last.appointment_id ?? null, p, body.slice(0, 4000));
  // the clinic answers by hand: the bot steps aside in this conversation for 12 hours
  if (r.ok) await db.from('wa_sessions').upsert({ phone: p, mode: 'human', human_until: new Date(Date.now() + 12 * 3600_000).toISOString(), step: '', data: {}, done_at: null, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  revalidatePath('/doctor/whatsapp');
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'השליחה נכשלה' };
}

/** Who answers this conversation: the bot, or the clinic (the bot stays quiet). */
export async function setBotMode(phone: string, mode: 'bot' | 'human'): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  const p = String(phone || '').replace(/\D/g, '');
  if (!staff || !/^\d{8,15}$/.test(p)) return { ok: false };
  await createAdminClient().from('wa_sessions').upsert({ phone: p, mode, human_until: mode === 'human' ? new Date(Date.now() + 7 * 86400_000).toISOString() : null, step: '', data: {}, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  revalidatePath('/doctor/whatsapp');
  return { ok: true };
}

/** Marks the conversation as handled (it leaves the "waiting for the clinic" filter). */
export async function markDone(phone: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: staff } = await supabase.rpc('is_staff');
  const p = String(phone || '').replace(/\D/g, '');
  if (!staff || !/^\d{8,15}$/.test(p)) return { ok: false };
  const db = createAdminClient();
  await db.from('wa_messages').update({ seen_at: new Date().toISOString() }).eq('phone', p).eq('direction', 'in').is('seen_at', null);
  await db.from('wa_sessions').upsert({ phone: p, mode: 'bot', human_until: null, done_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  revalidatePath('/doctor/whatsapp');
  return { ok: true };
}
