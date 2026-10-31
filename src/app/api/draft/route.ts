import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { TYPES, type ReferralType, type Settings } from '@/lib/constants';
import { loadDocBlocks } from '@/lib/caseDocs';
import { intakeForPrompt, type IntakeData } from '@/lib/intake';
import { buildPrompt } from '@/lib/letter';
import { aiErrorText } from '@/lib/aiErrors';
import { priorLetters, priorVisits } from '@/lib/visits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_MODEL = 'claude-opus-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail(401, 'צריך להתחבר מחדש.');
  const { data: staff } = await supabase.rpc('is_staff');
  if (!staff) return fail(403, 'אין הרשאה.');
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, 'חסר מפתח ה־AI (ANTHROPIC_API_KEY) בהגדרות Vercel.');

  const input = await req.json().catch(() => null);
  const appointmentId = String(input?.appointmentId || '');
  const letterType = String(input?.letterType || '') as ReferralType;
  const exam = String(input?.exam || '').slice(0, 20000);
  const instructions = String(input?.instructions || '').slice(0, 4000);
  const length = (['short', 'normal', 'long'] as const).find((x) => x === input?.length) ?? 'normal';
  if (!UUID.test(appointmentId) || !(letterType in TYPES)) return fail(400, 'בקשה לא תקינה.');

  const [{ data: a }, { data: notes }, { data: docs }, { data: settings }, { data: intake }] = await Promise.all([
    supabase.from('appointments').select('*, firms(name)').eq('id', appointmentId).maybeSingle(),
    supabase.from('case_notes').select('body').eq('appointment_id', appointmentId).order('created_at').limit(100),
    supabase.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(60),
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('case_intake').select('status, data').eq('appointment_id', appointmentId).maybeSingle(),
  ]);
  if (!a || !settings) return fail(404, 'התיק לא נמצא.');

  const { content, attached, skipped } = await loadDocBlocks(supabase, docs ?? []);

  const s = settings as Settings;
  content.push({
    type: 'text',
    text: buildPrompt({
      letterType,
      exam,
      settings: s,
      visitDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(a.starts_at)),
      patient: { name: a.patient_name, idNumber: a.patient_id_number, dob: a.patient_dob },
      firmName: (a.firms as { name?: string } | null)?.name ?? '',
      notes: [a.notes, ...(notes ?? []).map((n) => `(הערה נוספת) ${n.body}`)].join('\n').slice(0, 40000).split('\n'),
      attached,
      skipped,
      intake: intake?.status === 'done' ? intakeForPrompt(intake.data as IntakeData) : '',
      instructions,
      length,
      // earlier visits are mentioned only when the doctor added them to the document
      visits: input?.withVisits ? await priorVisits(supabase, a) : undefined,
      history: input?.withHistory ? await priorLetters(supabase, a) : undefined,
    }),
  });

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  await supabase.rpc('log_event', { p_action: 'ai_draft', p_entity: 'appointment', p_entity_id: appointmentId, p_details: { model, docs: attached.length, skipped: skipped.length } });

  const client = new Anthropic();
  const stream = client.messages.stream({ model, max_tokens: 16000, messages: [{ role: 'user', content }] });
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text));
        }
      } catch (e) {
        console.error('draft failed', (e as Error).message);
        // a marker the editor recognizes: the error is shown as a message and never written into the letter
        controller.enqueue(enc.encode(`\u0000ERR:${aiErrorText(e)}`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
