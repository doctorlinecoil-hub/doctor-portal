import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { askTool } from './aiTool';
import { loadDocBlocks } from './caseDocs';
import { ils, payLines, type Settings } from './constants';
import { fmtDate, todayIL } from './dates';

const DEFAULT_MODEL = 'claude-opus-5-5';

export type ProofCheck = {
  verdict: 'ok' | 'check' | 'bad';
  summary: string;
  issues: string[];
  amount: number | null;
  date: string;
  payer: string;
  recipient: string;
  account: string;
  reference: string;
  checked_at: string;
};

const TOOL: Anthropic.Tool = {
  name: 'transfer_check',
  description: 'The details read from a payment / bank transfer confirmation, and whether it matches what is owed.',
  input_schema: {
    type: 'object',
    properties: {
      is_payment_confirmation: { type: 'boolean', description: 'Is this really a payment confirmation (bank transfer, Bit/PayBox, card receipt)?' },
      amount: { type: ['number', 'null'], description: 'The amount transferred, in shekels' },
      date: { type: 'string', description: 'Transfer date, YYYY-MM-DD, or empty' },
      payer: { type: 'string', description: 'Who paid (name on the confirmation), or empty' },
      recipient: { type: 'string', description: 'Beneficiary name as written, or empty' },
      account: { type: 'string', description: 'Beneficiary bank / branch / account number (or Bit phone) as written, or empty' },
      reference: { type: 'string', description: 'Reference / confirmation number, or empty' },
      status_text: { type: 'string', description: 'Status shown (e.g. בוצע, ממתין, נדחה), or empty' },
      verdict: { type: 'string', enum: ['ok', 'check', 'bad'], description: 'ok = matches; check = something to verify; bad = not a valid confirmation / wrong recipient / wrong amount' },
      issues: { type: 'array', items: { type: 'string' }, description: 'Short Hebrew notes on every mismatch or doubt' },
      summary: { type: 'string', description: 'One short Hebrew sentence for the doctor' },
    },
    required: ['is_payment_confirmation', 'amount', 'date', 'payer', 'recipient', 'account', 'reference', 'status_text', 'verdict', 'issues', 'summary'],
  },
};

/** Reads a transfer confirmation and compares it with the amount owed and the clinic's account. Never throws. */
export async function checkProof(db: SupabaseClient, s: Settings, o: { path: string; fileName: string; due: number; patient: string; caseNo: number }): Promise<ProofCheck | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { content, attached } = await loadDocBlocks(db, [{ file_name: o.fileName, storage_path: o.path }]);
    if (!attached.length) return null;
    const pl = payLines(s);
    content.push({
      type: 'text',
      text: [
        'זהו קובץ שמשלם שלח כאישור העברה/תשלום למרפאה של רופא בישראל. קרא אותו בעיון והשווה למה שמצופה.',
        `סכום לתשלום: ${o.due > 0 ? ils(o.due) : 'לא הוגדר'}.`,
        `פרטי החשבון של המרפאה: ${pl.bank.length ? pl.bank.join(' · ') : 'לא הוגדרו'}${pl.bit ? ` · ביט/פייבוקס: ${pl.bit}` : ''}. שם המוטב הצפוי: ${s.lh_name}.`,
        `מטופל: ${o.patient} · תיק ${o.caseNo} · היום: ${fmtDate(todayIL())}.`,
        'בדוק: האם זה באמת אישור תשלום שבוצע (לא טיוטה, לא "ממתין", לא צילום של משהו אחר); הסכום; התאריך (לא עתידי, לא ישן מאוד); המוטב והחשבון תואמים למרפאה; סימנים לעריכה או זיוף.',
        'העתק פרטים בדיוק כפי שהם כתובים. מה שלא כתוב בבירור — השאר ריק. אל תמציא.',
        'verdict: ok רק אם הכל תואם בבירור. check אם משהו חסר או לא ניתן לאמת (למשל אין פרטי חשבון להשוואה, או החשבון לא מופיע). bad אם זה לא אישור תשלום, הסכום שונה, המוטב אחר, או סטטוס נדחה/ממתין.',
        'issues ו-summary בעברית קצרה וברורה לרופא. ההחלטה הסופית היא של הרופא.',
      ].join('\n'),
    });
    const r = await askTool<{ is_payment_confirmation: boolean; amount: number | null; date: string; payer: string; recipient: string; account: string; reference: string; status_text: string; verdict: string; issues: string[]; summary: string }>({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, maxTokens: 1500, tool: TOOL, content,
    });
    const verdict = r.verdict === 'ok' || r.verdict === 'bad' ? r.verdict : 'check';
    return {
      verdict: r.is_payment_confirmation === false ? 'bad' : verdict,
      summary: String(r.summary || '').slice(0, 300),
      issues: (Array.isArray(r.issues) ? r.issues : []).map((x) => String(x).slice(0, 200)).slice(0, 6),
      amount: typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : '',
      payer: String(r.payer || '').slice(0, 120),
      recipient: String(r.recipient || '').slice(0, 120),
      account: String(r.account || '').slice(0, 120),
      reference: String(r.reference || '').slice(0, 80),
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('proof check failed', String((e as Error)?.message ?? e).slice(0, 300));
    return null;
  }
}
