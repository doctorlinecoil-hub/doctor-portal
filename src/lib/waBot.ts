import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from './constants';
import { DAYS, fmtDate, ilParts, todayIL, weekday } from './dates';
import { availableSlots, type Busy } from './slots';
import { changeWindow } from './policy';
import { sendBotText, sendButtons, sendList, waOn, waPhone, type Row } from './whatsapp';
import { notifyCancelled, notifyNewRequest, notifyWaHandoff, sendMoved, sendSummons } from './notify';

/*
 * The WhatsApp assistant: a patient writes, and can book an appointment, see their appointments,
 * cancel or move one (within the clinic's change policy), get the address and hours, or ask for a person.
 * Everything runs on WhatsApp's interactive lists and buttons, inside the 24 hours the patient's message opened.
 * When the patient asks for a person (or the clinic answers by hand), the bot steps aside for 12 hours.
 */

type Session = { phone: string; step: string; data: Record<string, unknown>; mode: 'bot' | 'human'; human_until: string | null; updated_at: string };
export type Incoming = { phone: string; name: string; text: string; replyId: string };

const IDLE_MS = 30 * 60_000;
const HUMAN_MS = 12 * 3600_000;
const dayLabel = (d: string) => `יום ${DAYS[weekday(d)]} ${fmtDate(d)}`;
const whenLabel = (iso: string) => { const p = ilParts(iso); return `${dayLabel(p.date)} בשעה ${p.time}`; };
const localPhone = (p: string) => (p.startsWith('972') ? `0${p.slice(3)}` : p);
const norm = (t: string) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();

const MENU: Row[] = [
  { id: 'm:book', title: '📅 קביעת תור', description: 'בוחרים שירות, יום ושעה' },
  { id: 'm:mine', title: '🗓️ התורים שלי', description: 'צפייה, ביטול או שינוי מועד' },
  { id: 'm:info', title: '📍 כתובת ושעות פעילות', description: 'איך מגיעים ומתי פתוח' },
  { id: 'm:human', title: '💬 לדבר עם המרפאה', description: 'הצוות יחזור אליך' },
];

async function load(db: SupabaseClient, phone: string): Promise<Session> {
  const { data } = await db.from('wa_sessions').select('*').eq('phone', phone).maybeSingle();
  return (data as Session | null) ?? { phone, step: '', data: {}, mode: 'bot', human_until: null, updated_at: new Date(0).toISOString() };
}
async function save(db: SupabaseClient, phone: string, patch: Partial<Session>) {
  await db.from('wa_sessions').upsert({ phone, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
}

async function menu(db: SupabaseClient, s: Settings, phone: string, name: string, hello = true) {
  await save(db, phone, { step: 'menu', data: {} });
  const first = name ? name.split(' ')[0] : '';
  await sendList(db, null, phone, `${hello ? `שלום${first ? ` ${first}` : ''} 👋\n` : ''}כאן העוזר הדיגיטלי של ${s.lh_name}.\nבמה אפשר לעזור?`, 'בחירה', MENU);
}

/** Free slots for a service, from the same rules as the booking page. */
async function freeSlots(db: SupabaseClient, s: Settings) {
  const now = new Date();
  const until = new Date(now.getTime() + ((s.horizon_days || 30) + 2) * 86400_000);
  const [{ data: appts }, { data: blocks }] = await Promise.all([
    db.from('appointments').select('starts_at, ends_at').neq('status', 'cancelled').eq('walk_in', false).gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
    db.from('time_blocks').select('starts_at, ends_at').gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
  ]);
  return availableSlots(s, [...((appts as Busy[] | null) ?? []), ...((blocks as Busy[] | null) ?? [])], now);
}

/** The patient's upcoming appointments (by the WhatsApp number). */
async function mine(db: SupabaseClient, phone: string) {
  const { data } = await db.from('appointments').select('id, starts_at, status, service_label, patient_name, patient_phone')
    .in('status', ['pending', 'booked']).eq('walk_in', false).gt('starts_at', new Date().toISOString()).not('patient_phone', 'is', null)
    .order('starts_at').limit(400);
  return ((data ?? []) as { id: string; starts_at: string; status: string; service_label: string | null; patient_name: string; patient_phone: string }[])
    .filter((a) => waPhone(a.patient_phone) === phone).slice(0, 8);
}

async function askDay(db: SupabaseClient, s: Settings, phone: string, data: Record<string, unknown>, offset = 0) {
  const days = await freeSlots(db, s);
  if (!days.length) {
    await save(db, phone, { step: 'menu', data: {} });
    return sendButtons(db, null, phone, 'כרגע אין תורים פנויים ביומן 😕\nאפשר להשאיר הודעה ונחזור אליך.', [{ id: 'm:human', title: 'השארת הודעה' }, { id: 'm:menu', title: 'תפריט' }]);
  }
  const page = days.slice(offset, offset + 9);
  const rows: Row[] = page.map((d) => ({ id: `day:${d.date}`, title: dayLabel(d.date), description: `${d.times.length} שעות פנויות · מ־${d.times[0].time}` }));
  if (days.length > offset + 9) rows.push({ id: `days:${offset + 9}`, title: 'עוד תאריכים ←', description: 'הימים הבאים' });
  await save(db, phone, { step: 'day', data });
  return sendList(db, null, phone, `${data.reschedule ? 'לאיזה יום להעביר את התור?' : 'באיזה יום נוח לך?'}`, 'בחירת יום', rows);
}

async function askTime(db: SupabaseClient, s: Settings, phone: string, data: Record<string, unknown>, date: string, offset = 0) {
  const day = (await freeSlots(db, s)).find((d) => d.date === date);
  if (!day) return askDay(db, s, phone, data);
  const page = day.times.slice(offset, offset + 9);
  const rows: Row[] = page.map((t) => ({ id: `t:${t.iso}`, title: t.time, description: dayLabel(date) }));
  if (day.times.length > offset + 9) rows.push({ id: `times:${date}:${offset + 9}`, title: 'שעות מאוחרות יותר ←' });
  await save(db, phone, { step: 'time', data: { ...data, date } });
  return sendList(db, null, phone, `${dayLabel(date)} – באיזו שעה?`, 'בחירת שעה', rows);
}

async function confirmBooking(db: SupabaseClient, s: Settings, phone: string, data: Record<string, unknown>) {
  const svc = String(data.serviceLabel || 'תור');
  await save(db, phone, { step: 'confirm', data });
  return sendButtons(db, null, phone,
    `לאישור התור:\n\n👤 ${data.name}\n🩺 ${svc}\n📅 ${whenLabel(String(data.slot))}\n📍 ${s.lh_address || s.lh_name}\n\nהכול נכון?`,
    [{ id: 'c:yes', title: '✅ אישור' }, { id: 'c:edit', title: '✏️ שינוי מועד' }, { id: 'c:no', title: 'ביטול' }]);
}

async function book(db: SupabaseClient, s: Settings, phone: string, data: Record<string, unknown>) {
  // a few bookings a day from one number at most
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'wa_book').gte('at', since).contains('details', { phone });
  if ((count ?? 0) >= 3) {
    await save(db, phone, { step: 'menu', data: {} });
    return sendBotText(db, null, phone, 'נקבעו כבר כמה תורים מהמספר הזה היום. לתור נוסף אפשר לכתוב "נציג" ונחזור אליך.');
  }
  const { data: firm } = await db.from('firms').select('id').eq('kind', 'private').eq('active', true).order('created_at').limit(1).maybeSingle();
  if (!firm) return sendBotText(db, null, phone, 'קביעת תור בוואטסאפ לא זמינה כרגע. כתבו "נציג" ונחזור אליכם.');
  const { data: a, error } = await db.from('appointments').insert({
    firm_id: firm.id, starts_at: String(data.slot), service_id: String(data.serviceId),
    patient_name: String(data.name).slice(0, 120), patient_id_number: String(data.idNumber), patient_phone: localPhone(phone),
    patient_email: '', payer: 'patient', notes: 'נקבע בוואטסאפ', submitted_by: 'WhatsApp', source: 'whatsapp', mode: 'clinic',
  }).select('id, case_no, status').single();
  if (error || !a) {
    const taken = error?.code === '23505' || error?.code === '23P01';
    if (taken) { await sendBotText(db, null, phone, 'אוי, המועד הזה נתפס הרגע 🙈 בוא נבחר מועד אחר:'); return askDay(db, s, phone, { ...data, slot: undefined }); }
    await save(db, phone, { step: 'menu', data: {} });
    return sendButtons(db, null, phone, 'לא הצלחנו לקבוע את התור הזה. אפשר לנסות מועד אחר או להשאיר הודעה לצוות.', [{ id: 'm:book', title: 'מועד אחר' }, { id: 'm:human', title: 'לדבר עם המרפאה' }]);
  }
  await db.from('audit_log').insert({ user_id: null, action: 'wa_book', entity: 'appointment', entity_id: a.id, details: { phone } });
  await db.from('wa_messages').update({ appointment_id: a.id }).eq('phone', phone).is('appointment_id', null);
  await save(db, phone, { step: 'menu', data: {} });
  await notifyNewRequest(a.id).catch(() => undefined);
  if (a.status === 'booked') {
    await sendSummons(a.id).catch(() => undefined);
    return sendBotText(db, a.id, phone, `✅ התור נקבע!\n\n📅 ${whenLabel(String(data.slot))}\n📍 ${s.lh_address || s.lh_name}\n\nנשלח לך תזכורת לפני התור. לביטול או שינוי – כתבו "תפריט".`);
  }
  return sendBotText(db, a.id, phone, `📨 הבקשה התקבלה!\n\n📅 ${whenLabel(String(data.slot))}\n\nהמרפאה תאשר את התור בהקדם, ואז יישלח אליך זימון כאן בוואטסאפ.`);
}

async function showMine(db: SupabaseClient, s: Settings, phone: string) {
  const list = await mine(db, phone);
  if (!list.length) {
    await save(db, phone, { step: 'menu', data: {} });
    return sendButtons(db, null, phone, 'לא מצאנו תורים עתידיים למספר הזה.', [{ id: 'm:book', title: '📅 קביעת תור' }, { id: 'm:menu', title: 'תפריט' }]);
  }
  await save(db, phone, { step: 'mine', data: {} });
  return sendList(db, null, phone, `התורים הקרובים שלך (${list.length}):`, 'בחירת תור',
    list.map((a) => ({ id: `a:${a.id}`, title: whenLabel(a.starts_at).replace('בשעה ', ''), description: `${a.service_label || 'תור'} · ${a.status === 'pending' ? 'ממתין לאישור' : 'מאושר'}` })));
}

async function apptActions(db: SupabaseClient, s: Settings, phone: string, id: string) {
  const a = (await mine(db, phone)).find((x) => x.id === id);
  if (!a) return showMine(db, s, phone);
  const [{ count: approved }, { count: botMoves }] = await Promise.all([
    db.from('reschedule_requests').select('id', { count: 'exact', head: true }).eq('appointment_id', id).eq('status', 'approved'),
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'wa_move').eq('entity_id', id),
  ]);
  const w = changeWindow(s, a.starts_at, (approved ?? 0) + (botMoves ?? 0));
  const btns = [...(w.canMove ? [{ id: `mv:${id}`, title: '🔁 שינוי מועד' }] : []), ...(w.canCancel || a.status === 'pending' ? [{ id: `cx:${id}`, title: '✖️ ביטול התור' }] : []), { id: 'm:human', title: '💬 לדבר עם המרפאה' }];
  await save(db, phone, { step: 'appt', data: { apptId: id } });
  return sendButtons(db, id, phone, `📅 ${whenLabel(a.starts_at)}\n🩺 ${a.service_label || 'תור'}\nסטטוס: ${a.status === 'pending' ? 'ממתין לאישור המרפאה' : 'מאושר ✅'}${btns.length < 3 ? '\n\nשינוי או ביטול בשלב הזה – דרך הצוות.' : ''}`, btns);
}

async function cancelAppt(db: SupabaseClient, s: Settings, phone: string, id: string) {
  const a = (await mine(db, phone)).find((x) => x.id === id);
  if (!a) return showMine(db, s, phone);
  const w = changeWindow(s, a.starts_at);
  if (!(w.canCancel || a.status === 'pending')) return sendButtons(db, id, phone, 'כבר אי אפשר לבטל את התור הזה לבד. הצוות ישמח לעזור:', [{ id: 'm:human', title: 'לדבר עם המרפאה' }]);
  const { data: done } = await db.from('appointments').update({ status: 'cancelled', decline_reason: 'בוטל בוואטסאפ על ידי המטופל' }).eq('id', id).in('status', ['pending', 'booked']).select('id');
  await save(db, phone, { step: 'menu', data: {} });
  if (!done?.length) return sendBotText(db, id, phone, 'לא הצלחנו לבטל. כתבו "נציג" ונטפל בזה.');
  await notifyCancelled(id).catch(() => undefined);
  return sendButtons(db, id, phone, `התור של ${whenLabel(a.starts_at)} בוטל ✔️\nרוצה לקבוע מועד אחר?`, [{ id: 'm:book', title: '📅 קביעת תור חדש' }, { id: 'm:menu', title: 'תפריט' }]);
}

async function moveAppt(db: SupabaseClient, s: Settings, phone: string, data: Record<string, unknown>) {
  const id = String(data.reschedule);
  const a = (await mine(db, phone)).find((x) => x.id === id);
  if (!a) return showMine(db, s, phone);
  if (a.status !== 'pending' && !changeWindow(s, a.starts_at).canMove) {
    await save(db, phone, { step: 'menu', data: {} });
    return sendButtons(db, id, phone, 'כבר אי אפשר להעביר את התור הזה לבד. הצוות ישמח לעזור:', [{ id: 'm:human', title: 'לדבר עם המרפאה' }]);
  }
  const old = a.starts_at;
  const { data: cur } = await db.from('appointments').select('starts_at, ends_at').eq('id', id).single();
  const dur = new Date(cur!.ends_at).getTime() - new Date(cur!.starts_at).getTime();
  const slot = String(data.slot);
  const { error } = await db.from('appointments').update({
    starts_at: slot, ends_at: new Date(new Date(slot).getTime() + dur).toISOString(),
    reminder_sent_at: null, remind_3d_at: null, remind_2h_at: null,
  }).eq('id', id).in('status', ['pending', 'booked']);
  await save(db, phone, { step: 'menu', data: {} });
  if (error) {
    if (error.code === '23P01') { await sendBotText(db, id, phone, 'המועד הזה נתפס הרגע. נבחר אחר:'); return askDay(db, s, phone, { reschedule: id }); }
    return sendBotText(db, id, phone, 'לא הצלחנו להעביר את התור. כתבו "נציג" ונטפל בזה.');
  }
  await db.from('audit_log').insert({ user_id: null, action: 'wa_move', entity: 'appointment', entity_id: id, details: { phone, from: old, to: slot } });
  await sendMoved(id, old).catch(() => undefined);
  return sendBotText(db, id, phone, `✅ התור הועבר!\n\nהמועד החדש: ${whenLabel(slot)}\n(במקום ${whenLabel(old)})`);
}

async function handoff(db: SupabaseClient, s: Settings, phone: string, name: string, text: string) {
  await save(db, phone, { step: '', data: {}, mode: 'human', human_until: new Date(Date.now() + HUMAN_MS).toISOString() });
  await sendBotText(db, null, phone, `העברנו את השיחה לצוות ${s.lh_name} 🙏\nנחזור אליך בהקדם${s.lh_phone ? `. לדברים דחופים: ${s.lh_phone}` : '.'}`);
  await notifyWaHandoff({ name, phone, text }).catch(() => undefined);
}

async function info(db: SupabaseClient, s: Settings, phone: string) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, c: s.weekly?.[String(d)] })).filter((x) => x.c?.on).map((x) => `${DAYS[x.d]}: ${x.c!.from}–${x.c!.to}`);
  const addr = s.lh_address ? `📍 ${s.lh_address}\nניווט: https://waze.com/ul?q=${encodeURIComponent(s.lh_address)}&navigate=yes` : '';
  await save(db, phone, { step: 'menu', data: {} });
  return sendButtons(db, null, phone, [`*${s.lh_name}*`, addr, days.length ? `🕘 שעות קבלה:\n${days.join('\n')}` : '', s.lh_phone ? `📞 ${s.lh_phone}` : ''].filter(Boolean).join('\n\n'),
    [{ id: 'm:book', title: '📅 קביעת תור' }, { id: 'm:menu', title: 'תפריט' }]);
}

/** One incoming message. Returns quietly when the bot is off or a person handles the conversation. */
export async function handleIncoming(db: SupabaseClient, s: Settings, m: Incoming): Promise<unknown> {
  if (!waOn(s) || s.whatsapp_bot === false) return;
  const ses = await load(db, m.phone);
  // typed words count only when it is not a tap on a list or a button
  const t = m.replyId ? '' : norm(m.text);
  const id = m.replyId;

  // a person handles this conversation: the bot stays quiet until the time is up, or the patient asks for the menu
  const human = ses.mode === 'human' && (!ses.human_until || new Date(ses.human_until).getTime() > Date.now());
  if (human && !['תפריט', 'menu', 'בוט'].includes(t)) return;
  if (ses.mode === 'human') await save(db, m.phone, { mode: 'bot', human_until: null });

  const fresh = Date.now() - new Date(ses.updated_at).getTime() > IDLE_MS;
  const data = (ses.data ?? {}) as Record<string, unknown>;

  // words that work everywhere
  if (['נציג', 'מרפאה', 'אדם', 'עזרה אנושית', 'לדבר עם מישהו'].includes(t) || id === 'm:human') return handoff(db, s, m.phone, m.name, m.text);
  if (['תפריט', 'menu', 'התחלה', 'היי', 'הי', 'שלום', 'hi', 'hello', '0'].includes(t) || id === 'm:menu') return menu(db, s, m.phone, m.name);
  if (id === 'm:info' || ['כתובת', 'שעות', 'איפה'].includes(t)) return info(db, s, m.phone);
  if (id === 'm:mine' || ['התורים שלי', 'תורים'].includes(t)) return showMine(db, s, m.phone);
  if (id === 'm:book' || ['תור', 'קביעת תור', 'לקבוע תור'].includes(t)) {
    const { data: svcs } = await db.from('services').select('id, label, description, duration_minutes').eq('active', true).order('sort').order('label').limit(10);
    const list = (svcs ?? []) as { id: string; label: string; description: string | null; duration_minutes: number | null }[];
    if (list.length === 1) return askDay(db, s, m.phone, { serviceId: list[0].id, serviceLabel: list[0].label });
    await save(db, m.phone, { step: 'service', data: {} });
    return sendList(db, null, m.phone, 'איזה סוג ביקור?', 'בחירת שירות', list.map((x) => ({ id: `svc:${x.id}`, title: x.label, description: x.description || (x.duration_minutes ? `${x.duration_minutes} דקות` : '') })));
  }

  if (id.startsWith('svc:')) {
    const { data: svc } = await db.from('services').select('id, label').eq('id', id.slice(4)).eq('active', true).maybeSingle();
    if (!svc) return menu(db, s, m.phone, m.name, false);
    return askDay(db, s, m.phone, { serviceId: svc.id, serviceLabel: svc.label });
  }
  if (id.startsWith('days:')) return askDay(db, s, m.phone, data, Number(id.slice(5)) || 0);
  if (id.startsWith('day:')) return askTime(db, s, m.phone, data, id.slice(4));
  if (id.startsWith('times:')) { const [, date, off] = id.split(':'); return askTime(db, s, m.phone, data, date, Number(off) || 0); }
  if (id.startsWith('t:')) {
    const slot = id.slice(2);
    if (Number.isNaN(Date.parse(slot)) || new Date(slot).getTime() < Date.now()) return askDay(db, s, m.phone, data);
    if (data.reschedule) return moveAppt(db, s, m.phone, { ...data, slot });
    const next = { ...data, slot };
    if (data.name && data.idNumber) return confirmBooking(db, s, m.phone, next);
    await save(db, m.phone, { step: 'name', data: next });
    return sendBotText(db, null, m.phone, `מעולה, ${whenLabel(slot)} ✔️\n\nמה השם המלא של המטופל/ת?`);
  }
  if (id.startsWith('a:')) return apptActions(db, s, m.phone, id.slice(2));
  if (id.startsWith('cx:')) {
    await save(db, m.phone, { step: 'cancel', data: { apptId: id.slice(3) } });
    return sendButtons(db, id.slice(3), m.phone, 'לבטל את התור?', [{ id: `cxy:${id.slice(3)}`, title: 'כן, לבטל' }, { id: 'm:mine', title: 'לא, חזרה' }]);
  }
  if (id.startsWith('cxy:')) return cancelAppt(db, s, m.phone, id.slice(4));
  if (id.startsWith('mv:')) return askDay(db, s, m.phone, { reschedule: id.slice(3) });
  if (id === 'c:yes' && ses.step === 'confirm') return book(db, s, m.phone, data);
  if (id === 'c:edit') return askDay(db, s, m.phone, { ...data, slot: undefined });
  if (id === 'c:no') { await save(db, m.phone, { step: 'menu', data: {} }); return sendButtons(db, null, m.phone, 'בוטל. אפשר לחזור בכל רגע 🙂', [{ id: 'm:menu', title: 'תפריט' }]); }

  // free text inside a step
  if (!fresh && ses.step === 'name' && !id) {
    const name = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (name.length < 2 || /\d/.test(name)) return sendBotText(db, null, m.phone, 'נא לכתוב שם מלא (שם פרטי ושם משפחה).');
    await save(db, m.phone, { step: 'id', data: { ...data, name } });
    return sendBotText(db, null, m.phone, `תודה ${name.split(' ')[0]} 🙏\nמה מספר תעודת הזהות? (נדרש לפתיחת התיק)`);
  }
  if (!fresh && ses.step === 'id' && !id) {
    const digits = m.text.replace(/\D/g, '');
    if (digits.length < 5 || digits.length > 9) return sendBotText(db, null, m.phone, 'נא לכתוב מספר תעודת זהות (5–9 ספרות).');
    return confirmBooking(db, s, m.phone, { ...data, idNumber: digits.padStart(9, '0') });
  }

  // anything else: the menu (but not after the clinic answered by hand a moment ago)
  const { data: lastOut } = await db.from('wa_messages').select('bot, created_at').eq('phone', m.phone).eq('direction', 'out').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (lastOut && !lastOut.bot && Date.now() - new Date(lastOut.created_at).getTime() < HUMAN_MS) return;
  return menu(db, s, m.phone, m.name, fresh || !ses.step);
}

/** Today's date, for tests. */
export const _today = todayIL;
