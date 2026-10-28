import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { BUCKET, TYPES, type ReferralType, type Settings } from '@/lib/constants';
import { buildPrompt } from '@/lib/letter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_DOC_BYTES = 22 * 1024 * 1024; // keeps the request under the API's 32MB limit after base64
const DEFAULT_MODEL = 'claude-opus-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Kind = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

/** The file's real type from its first bytes (never trust the uploaded label). */
function sniff(b: Buffer): Kind | null {
  if (b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

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
  if (!UUID.test(appointmentId) || !(letterType in TYPES)) return fail(400, 'בקשה לא תקינה.');

  const [{ data: a }, { data: notes }, { data: docs }, { data: settings }] = await Promise.all([
    supabase.from('appointments').select('*, firms(name)').eq('id', appointmentId).maybeSingle(),
    supabase.from('case_notes').select('body').eq('appointment_id', appointmentId).order('created_at').limit(100),
    supabase.from('documents').select('file_name, storage_path').eq('appointment_id', appointmentId).order('created_at').limit(60),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);
  if (!a || !settings) return fail(404, 'התיק לא נמצא.');

  const content: Anthropic.ContentBlockParam[] = [];
  const attached: string[] = [];
  const skipped: string[] = [];
  let used = 0;
  for (const d of docs ?? []) {
    if (used >= MAX_DOC_BYTES) { skipped.push(d.file_name); continue; }
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(d.storage_path);
    if (error || !blob || used + blob.size > MAX_DOC_BYTES) { skipped.push(d.file_name); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) { skipped.push(d.file_name); continue; }
    used += buf.length;
    const data = buf.toString('base64');
    if (kind === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: kind, data }, title: d.file_name.slice(0, 200) });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: kind, data } });
    }
    attached.push(d.file_name);
  }

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
        controller.enqueue(enc.encode('\n\n[הניסוח נעצר בגלל תקלה. נסו שוב.]'));
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
