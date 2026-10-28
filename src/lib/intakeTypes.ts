import type { ReferralType } from './constants';

export type IntakeData = {
  summary: string;
  request: { goal: string; recipient: string; event: string; event_date: string; questions: string[] };
  patient_check: { item: string; detail: string }[];
  diagnoses: { name: string; date: string; source: string }[];
  timeline: { date: string; title: string; detail: string; source: string }[];
  imaging: { date: string; test: string; finding: string; source: string }[];
  medications: string[];
  treatments: string[];
  function_work: string;
  red_flags: { text: string; level: 'high' | 'medium' }[];
  missing: { item: string; why: string }[];
  documents: { file: string; kind: string; date: string; gist: string }[];
  exam_focus: string[];
  suggested_type: ReferralType | '';
  type_note: string;
  readiness: number;
};

export type IntakeRow = {
  status: 'queued' | 'running' | 'done' | 'error';
  data: IntakeData | null;
  error: string;
  doc_count: number;
  started_at: string | null;
  finished_at: string | null;
};

/** "2025-03-14" / "2025-03" / "2025" → "14.3.2025" / "3.2025" / "2025". */
export function fuzzyDate(d: string) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(d || '');
  if (!m) return d || '';
  if (m[3]) return `${+m[3]}.${+m[2]}.${m[1]}`;
  if (m[2]) return `${+m[2]}.${m[1]}`;
  return m[1];
}
