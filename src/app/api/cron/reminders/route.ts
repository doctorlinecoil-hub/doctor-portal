import { sendReminders } from '@/lib/notify';
import { cleanupTmpUploads } from '@/lib/tmpUploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });
  const r = await sendReminders();
  const tmpRemoved = await cleanupTmpUploads().catch(() => -1);
  return Response.json({ ...r, tmpRemoved });
}
