import 'server-only';
import type { PayMethod } from './constants';

/*
 * Morning (חשבונית ירוקה) API: issues a "חשבונית מס / קבלה" (document type 320) for a payment.
 * Needs MORNING_API_KEY_ID and MORNING_API_KEY_SECRET (Morning: הגדרות → כלים למפתחים → מפתחות API).
 * Set MORNING_ENV=sandbox to test against Morning's sandbox.
 */

const sandbox = process.env.MORNING_ENV === 'sandbox';
const API = sandbox ? 'https://sandbox.d.greeninvoice.co.il/api/v1' : 'https://api.greeninvoice.co.il/api/v1';
const IDP = sandbox ? 'https://api.sandbox.morning.dev/idp/v1/oauth/token' : 'https://api.morning.co/idp/v1/oauth/token';

export function morningEnabled() {
  return !!(process.env.MORNING_API_KEY_ID && process.env.MORNING_API_KEY_SECRET);
}

let cached: { token: string; until: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const id = process.env.MORNING_API_KEY_ID!;
  const secret = process.env.MORNING_API_KEY_SECRET!;
  // current OAuth endpoint
  try {
    const r = await fetch(IDP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
      signal: AbortSignal.timeout(20_000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j?.accessToken) {
        cached = { token: j.accessToken, until: (Number(j.expiresAt) || Date.now() / 1000 + 3600) * 1000 };
        return cached.token;
      }
    }
  } catch {
    // fall back to the older endpoint below
  }
  const r = await fetch(`${API}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, secret }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.token) throw new Error('ההתחברות למורנינג נכשלה. בדקו את מפתחות ה־API.');
  cached = { token: j.token, until: Date.now() + 50 * 60_000 };
  return cached.token;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || (j && typeof j === 'object' && 'errorCode' in j && j.errorCode)) {
    throw new Error(`מורנינג: ${(j && (j.errorMessage || j.message)) || `שגיאה ${r.status}`}`);
  }
  return j as T;
}

export type InvoiceClient = { name: string; taxId?: string; email?: string; phone?: string };

async function clientId(c: InvoiceClient): Promise<string> {
  type Found = { items?: { id: string; name?: string; taxId?: string }[] } | { id: string; name?: string; taxId?: string }[];
  const q = c.taxId ? { taxId: c.taxId } : { name: c.name };
  const found = await call<Found>('/clients/search', { ...q, page: 1, pageSize: 5 }).catch(() => null);
  const items = Array.isArray(found) ? found : found?.items ?? [];
  const match = items.find((x) => (c.taxId ? x.taxId === c.taxId : x.name === c.name));
  if (match) return match.id;
  const created = await call<{ id: string }>('/clients', {
    name: c.name,
    ...(c.taxId ? { taxId: c.taxId } : {}),
    ...(c.email ? { emails: [c.email] } : {}),
    ...(c.phone ? { phone: c.phone } : {}),
    active: true,
  });
  return created.id;
}

const PAYMENT_TYPE: Record<PayMethod, number | null> = { cash: 1, check: 2, card: 3, transfer: 4, bit: 10, other: null };

export type ChequeInfo = { chequeNum?: string; bankName?: string; bankBranch?: string; bankAccount?: string };

/** Creates a tax invoice / receipt (320) for one payment. Prices include VAT. */
export async function issueReceipt(opts: {
  client: InvoiceClient;
  sendEmail: boolean;
  description: string;
  remarks: string;
  amount: number;
  method: PayMethod;
  date: string;
  cheque?: ChequeInfo;
}): Promise<{ id: string; number: string; url: string }> {
  const type = PAYMENT_TYPE[opts.method];
  if (type == null) throw new Error('כדי להפיק חשבונית במורנינג, בחרו אמצעי תשלום מוגדר (לא ״אחר״).');
  if (opts.method === 'check' && !opts.cheque?.chequeNum) throw new Error('לצ׳ק צריך מספר צ׳ק, בנק, סניף וחשבון.');
  const id = await clientId(opts.client);
  const payment: Record<string, unknown> = { type, price: opts.amount, currency: 'ILS', currencyRate: 1, date: opts.date };
  if (opts.method === 'bit') payment.appType = 1;
  if (opts.method === 'check') Object.assign(payment, opts.cheque);
  const doc = await call<{ id: string; number: number | string; url?: { he?: string; origin?: string } }>('/documents', {
    type: 320,
    date: opts.date,
    lang: 'he',
    currency: 'ILS',
    vatType: 0,
    signed: true,
    rounding: false,
    remarks: opts.remarks,
    client: { id, ...(opts.sendEmail && opts.client.email ? { emails: [opts.client.email] } : {}) },
    income: [{ description: opts.description, quantity: 1, price: opts.amount, currency: 'ILS', currencyRate: 1, vatType: 1 }],
    payment: [payment],
  });
  const url = doc.url?.he || doc.url?.origin || '';
  return { id: doc.id, number: String(doc.number), url: url.startsWith('https://') ? url : '' };
}
