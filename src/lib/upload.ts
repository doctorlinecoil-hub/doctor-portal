'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCEPTED_TYPES, BUCKET, MAX_FILE_BYTES } from './constants';

export function checkFile(f: File): string | null {
  if (!ACCEPTED_TYPES.includes(f.type)) return `${f.name}: אפשר לצרף רק PDF או תמונה (JPG, PNG)`;
  if (f.size > MAX_FILE_BYTES) return `${f.name}: הקובץ גדול מ־25MB`;
  if (f.size === 0) return `${f.name}: הקובץ ריק`;
  return null;
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Uploads files to the case folder and records them. Returns names that failed. */
export async function uploadCaseFiles(
  supabase: SupabaseClient,
  firmId: string,
  appointmentId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const failed: string[] = [];
  let done = 0;
  for (const f of files) {
    const path = `${firmId}/${appointmentId}/${crypto.randomUUID()}.${EXT[f.type] || 'bin'}`;
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) {
      failed.push(f.name);
    } else {
      const { error } = await supabase.from('documents').insert({
        appointment_id: appointmentId, firm_id: firmId, storage_path: path, file_name: f.name.slice(0, 255), mime_type: f.type, size_bytes: f.size,
      });
      if (error) failed.push(f.name);
    }
    onProgress?.(++done, files.length);
  }
  return failed;
}
