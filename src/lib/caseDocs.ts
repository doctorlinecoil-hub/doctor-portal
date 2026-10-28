import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET } from './constants';

const MAX_DOC_BYTES = 22 * 1024 * 1024; // keeps the request under the API's 32MB limit after base64
type Kind = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

/** The file's real type from its first bytes (never trust the uploaded label). */
export function sniff(b: Buffer): Kind | null {
  if (b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Downloads a case's documents and turns them into Claude content blocks (PDFs as documents, scans as images). */
export async function loadDocBlocks(db: SupabaseClient, docs: { file_name: string; storage_path: string }[]) {
  const content: Anthropic.ContentBlockParam[] = [];
  const attached: string[] = [];
  const skipped: string[] = [];
  let used = 0;
  for (const d of docs) {
    if (used >= MAX_DOC_BYTES) { skipped.push(d.file_name); continue; }
    const { data: blob, error } = await db.storage.from(BUCKET).download(d.storage_path);
    if (error || !blob || used + blob.size > MAX_DOC_BYTES) { skipped.push(d.file_name); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) { skipped.push(d.file_name); continue; }
    used += buf.length;
    const data = buf.toString('base64');
    content.push({ type: 'text', text: `מסמך ${attached.length + 1}: ${d.file_name}` });
    if (kind === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: kind, data }, title: d.file_name.slice(0, 200) });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: kind, data } });
    }
    attached.push(d.file_name);
  }
  return { content, attached, skipped };
}
