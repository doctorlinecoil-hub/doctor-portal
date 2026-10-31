import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * Replies to payment emails come back into the system (Resend "Receiving"):
 * each payment email gets its own reply address  pay-<case>-<token>@<INBOUND_EMAIL_DOMAIN>,
 * so a reply with the transfer confirmation lands in the right case. The token stops anyone
 * from guessing another case's address. Off until INBOUND_EMAIL_DOMAIN is set (Vercel env, e.g. <id>.resend.app).
 */

const secret = () => process.env.INBOUND_SECRET || process.env.RESEND_API_KEY || '';
const tokenFor = (caseNo: number) => createHmac('sha256', secret()).update(`pay:${caseNo}`).digest('hex').slice(0, 12);

export function inboundEnabled() {
  return !!(process.env.INBOUND_EMAIL_DOMAIN && secret());
}

/** The reply address of the payment emails of one case (undefined when receiving is off). */
export function payReplyAddress(caseNo: number) {
  if (!inboundEnabled()) return undefined;
  return `pay-${caseNo}-${tokenFor(caseNo)}@${String(process.env.INBOUND_EMAIL_DOMAIN).trim().replace(/^@/, '')}`;
}

/** The case number behind a reply address, only when its token is right. */
export function caseFromAddress(addr: string): number | null {
  const m = /pay-(\d{1,9})-([0-9a-f]{12})@/i.exec(addr || '');
  if (!m) return null;
  const n = Number(m[1]);
  const a = Buffer.from(m[2].toLowerCase());
  const b = Buffer.from(tokenFor(n));
  return a.length === b.length && timingSafeEqual(a, b) ? n : null;
}

/** Svix signature check of a Resend webhook (raw body, svix-id / svix-timestamp / svix-signature, secret "whsec_..."). */
export function verifyWebhook(raw: string, h: { id: string | null; timestamp: string | null; signature: string | null }) {
  const sec = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!sec || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(sec.startsWith('whsec_') ? sec.slice(6) : sec, 'base64');
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${raw}`).digest('base64');
  return h.signature.split(' ').some((part) => {
    const sig = part.split(',')[1] || '';
    const x = Buffer.from(sig);
    const y = Buffer.from(expected);
    return x.length === y.length && timingSafeEqual(x, y);
  });
}
