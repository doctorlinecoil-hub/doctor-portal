import 'server-only';

/*
 * The Israeli Ministry of Health drug registry (the public registries site), searched live.
 * Only names, forms and strengths are used: no patient data is ever sent.
 */
const BASE = 'https://registries.health.gov.il/api/Medicines/';

export type DrugHit = { reg: string; name: string };
export type DrugInfo = {
  reg: string; nameHe: string; nameEn: string; formHe: string; formEn: string;
  strength: string; components: { name: string; dosage: string }[]; basket: boolean;
};

async function get<T>(path: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(BASE + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text.startsWith('{') && !text.startsWith('[')) return null; // the site's firewall answers with an HTML page
    const j = JSON.parse(text);
    return (j?.returnObject ?? j) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Names as the doctor types (Hebrew or English). One entry per registration, Hebrew name first. */
export async function searchDrugs(q: string): Promise<DrugHit[] | null> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const list = await get<{ regNumber: string; tradeNameHebOrEng: string }[]>(`GetTradeNames?tradeNameAutocomplete=${encodeURIComponent(term)}`);
  if (!list) return null;
  const seen = new Map<string, DrugHit>();
  for (const x of list) {
    if (!x?.regNumber || !x.tradeNameHebOrEng) continue;
    const name = String(x.tradeNameHebOrEng).trim();
    const cur = seen.get(x.regNumber);
    // keep the name in the language the doctor typed
    const typedHeb = /[֐-׿]/.test(term);
    const isHeb = /[֐-׿]/.test(name);
    if (!cur || (typedHeb === isHeb && /[֐-׿]/.test(cur.name) !== typedHeb)) seen.set(x.regNumber, { reg: x.regNumber, name });
  }
  return [...seen.values()].slice(0, 15);
}

type Med = {
  regNumber: string; tradeName: string; tradeNameHeb: string; dosageFormE: string; dosageFormHeb: string; basket: string;
  components?: { componentDesc: string; dosage: string }[];
};

export async function drugDetails(reg: string): Promise<DrugInfo | null> {
  if (!/^[\d ]{6,20}$/.test(reg)) return null;
  const m = await get<Med>(`GetMedicineByRegNumber?regNumber=${encodeURIComponent(reg)}`);
  if (!m || !m.regNumber) return null;
  const components = (m.components ?? []).map((c) => ({ name: String(c.componentDesc || '').trim(), dosage: String(c.dosage || '').trim() })).filter((c) => c.name);
  return {
    reg: m.regNumber, nameHe: m.tradeNameHeb || '', nameEn: m.tradeName || '', formHe: m.dosageFormHeb || '', formEn: m.dosageFormE || '',
    strength: components.map((c) => `${c.name} ${c.dosage}`.trim()).join(' + ').slice(0, 200),
    components, basket: m.basket === 'כן',
  };
}
