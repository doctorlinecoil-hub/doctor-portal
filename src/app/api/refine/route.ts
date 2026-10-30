import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { TYPES, type ReferralType } from '@/lib/constants';
import { buildRefinePrompt, type RefineAction } from '@/lib/letter';
import { aiErrorText } from '@/lib/aiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_MODEL = 'claude-opus-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: RefineAction[] = ['polish', 'shorten', 'expand', 'proof', 'simple', 'custom'];
const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Improves the letter the doctor already has: polish, shorten, expand, proofread, plain language, or free instructions. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail(401, 'צריך להתחבר מחדש.');
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return fail(403, 'אין הרשאה.');
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, 'חסר מפתח ה־AI (ANTHROPIC_API_KEY) בהגדרות Vercel.');

  const input = await req.json().catch(() => null);
  const appointmentId = String(input?.appointmentId || '');
  const action = ACTIONS.find((a) => a === input?.action);
  const letterType = String(input?.letterType || '') as ReferralType;
  const body = String(input?.body || '').slice(0, 60000);
  const instructions = String(input?.instructions || '').slice(0, 4000);
  if (!UUID.test(appointmentId) || !action || !(letterType in TYPES)) return fail(400, 'בקשה לא תקינה.');
  if (!body.trim()) return fail(400, 'אין עדיין טקסט לשפר.');
  if (action === 'custom' && !instructions.trim()) return fail(400, 'כתבו מה לשנות.');

  const { data: s } = await supabase.from('settings').select('lh_name, lh_titles').eq('id', 1).single();
  const doctor = (s?.lh_name || 'הרופא') + (s?.lh_titles ? ` – ${String(s.lh_titles).replace(/\n+/g, '; ')}` : '');
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  await supabase.rpc('log_event', { p_action: 'ai_refine', p_entity: 'appointment', p_entity_id: appointmentId, p_details: { model, action } });

  const client = new Anthropic();
  const stream = client.messages.stream({ model, max_tokens: 16000, messages: [{ role: 'user', content: buildRefinePrompt({ action, body, instructions, letterType, doctor }) }] });
  const enc = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text));
        }
      } catch (e) {
        console.error('refine failed', (e as Error).message);
        controller.enqueue(enc.encode(`\u0000ERR:${aiErrorText(e)}`));
      } finally {
        controller.close();
      }
    },
    cancel() { stream.abort(); },
  });
  return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
