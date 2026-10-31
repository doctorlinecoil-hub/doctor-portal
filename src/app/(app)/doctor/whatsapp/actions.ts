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
  revalidatePath('/doctor/whatsapp');
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'השליחה נכשלה' };
}
