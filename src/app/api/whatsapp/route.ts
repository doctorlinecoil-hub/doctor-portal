import { createAdminClient } from '@/lib/supabase/admin';
import { caseOfPhone, validSignature } from '@/lib/whatsapp';
import { handleIncoming } from '@/lib/waBot';
import { SETTINGS_DEFAULTS, type Settings } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meta checks the webhook address once: it sends the verify token and expects the challenge back. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === token) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

type Msg = { from: string; id: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }; image?: { caption?: string }; document?: { filename?: string; caption?: string } };
type Status = { id: string; status: string; errors?: { title?: string; message?: string }[] };

const LABEL: Record<string, string> = { image: '📷 תמונה', document: '📄 קובץ', audio: '🎤 הודעה קולית', video: '🎬 סרטון', sticker: 'מדבקה', location: '📍 מיקום', contacts: '👤 איש קשר' };

/** Incoming messages and delivery statuses. Only requests signed by Meta (the app secret) are accepted. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  let body: { entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: Msg[]; statuses?: Status[] } }[] }[] };
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  const db = createAdminClient();
  let settings: Settings | null = null;
  for (const e of body.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      const names = new Map((v.contacts ?? []).map((x) => [x.wa_id, x.profile?.name || '']));
      for (const m of v.messages ?? []) {
        const phone = String(m.from || '').replace(/\D/g, '');
        if (!phone) continue;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
          ?? [LABEL[m.type] || m.type, m.image?.caption || m.document?.caption || m.document?.filename || ''].filter(Boolean).join(' · ');
        // the same message can arrive twice; wa_id is unique, and only a new one goes to the bot
        const name = (names.get(m.from) || '').slice(0, 120);
        const { data: fresh } = await db.from('wa_messages').upsert({
          appointment_id: await caseOfPhone(db, phone), phone, name,
          direction: 'in', kind: m.type || 'text', body: String(text).slice(0, 4000), wa_id: m.id, status: 'received',
        }, { onConflict: 'wa_id', ignoreDuplicates: true }).select('id');
        if (!fresh?.length) continue;
        settings ??= { ...SETTINGS_DEFAULTS, ...((await db.from('settings').select('*').eq('id', 1).single()).data as Settings) } as Settings;
        const replyId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? '';
        await handleIncoming(db, settings, { phone, name, text: String(text), replyId }).catch((e) => console.error('wa bot', e));
      }
      for (const st of v.statuses ?? []) {
        const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
        if (!rank[st.status]) continue;
        const { data: cur } = await db.from('wa_messages').select('status').eq('wa_id', st.id).maybeSingle();
        if (!cur || (rank[cur.status] ?? 0) >= rank[st.status]) continue;
        const err = st.errors?.[0];
        await db.from('wa_messages').update({ status: st.status, ...(err ? { error: String(err.message || err.title || '').slice(0, 900) } : {}) }).eq('wa_id', st.id);
      }
    }
  }
  return new Response('ok');
}
