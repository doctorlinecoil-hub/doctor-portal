import { notFound } from 'next/navigation';
import ShareLink from '@/components/ShareLink';
import { PendingPayView } from '@/views/PendingPayView';
import ApprovePay from '@/app/(app)/doctor/payments/ApprovePay';
import AppShell from '@/components/AppShell';
import AuthFrame from '@/components/AuthFrame';
import LoginForm from '@/app/login/LoginForm';
import SlotBooking from '@/app/(app)/firm/book/SlotBooking';
import DetailsWizard from '@/app/(app)/firm/cases/[id]/details/DetailsWizard';
import NewCaseForm from '@/app/(app)/doctor/new/NewCaseForm';
import DiagnosesPanel from '@/app/(app)/doctor/cases/[id]/DiagnosesPanel';
import PrescriptionPanel from '@/app/(app)/doctor/cases/[id]/PrescriptionPanel';
import ServicesAdmin from '@/app/(app)/doctor/services/ServicesAdmin';
import type { Service } from '@/lib/services';
import TemplatePicker from '@/app/(app)/doctor/cases/[id]/TemplatePicker';
import PublicBooking from '@/app/book/PublicBooking';
import BookingForm from '@/app/(app)/firm/book/BookingForm';
import CaseActions from '@/app/(app)/firm/cases/[id]/CaseActions';
import LetterEditor from '@/app/(app)/doctor/cases/[id]/LetterEditor';
import PaymentPanel from '@/app/(app)/doctor/cases/[id]/PaymentPanel';
import DoctorCancel from '@/app/(app)/doctor/cases/[id]/DoctorCancel';
import IntakePanel from '@/app/(app)/doctor/cases/[id]/IntakePanel';
import CommsPanel from '@/app/(app)/doctor/cases/[id]/CommsPanel';
import ApprovalButtons from '@/app/(app)/doctor/ApprovalButtons';
import SettingsForm from '@/app/(app)/admin/SettingsForm';
import UsersAdmin from '@/app/(app)/admin/users/UsersAdmin';
import { PageHead } from '@/components/ui';
import { availableSlots } from '@/lib/slots';
import { FirmCaseView, FirmCasesView, FirmDashboardView } from '@/views/FirmViews';
import { DoctorAgendaView, DoctorCaseView, payerName } from '@/views/DoctorViews';
import { PaymentsView } from '@/views/PaymentsView';
import { LogView } from '@/views/LogView';
import LetterPaper from '@/views/LetterPaper';
import PrintButton from '@/app/letters/[id]/print/PrintButton';
import { todayIL } from '@/lib/dates';
import * as fx from '@/preview/fixtures';
import { CalendarView } from '@/views/CalendarView';
import { ReportsView } from '@/views/ReportsView';
import { buildReport } from '@/lib/reports';
import TemplatesAdmin from '@/app/(app)/doctor/templates/TemplatesAdmin';
import { FreeSlot, RemoveBlock, BlockForm } from '@/app/(app)/doctor/calendar/CalendarTools';
import RescheduleRequest from '@/app/(app)/firm/cases/[id]/RescheduleRequest';
import Landing from '@/views/Landing';
import Icon from '@/components/Icon';
import RegisterForm from '@/app/register/RegisterForm';
import DepositBox from '@/components/DepositBox';
import PendingSignups from '@/app/(app)/admin/users/PendingSignups';
import { payLines } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const SVC: Service[] = [
  { id: 's1', label: 'הפניה לבדיקות', description: 'הפניה ל־MRI, CT, EMG או בדיקות אחרות', icon: 'activity', base_type: 'referral', price: 600, active: true, sort: 1 },
  { id: 's2', label: 'סיכום ביקור', description: 'סיכום אחרי בדיקה במרפאה', icon: 'stethoscope', base_type: 'summary', price: 900, active: true, sort: 2 },
  { id: 's3', label: 'חוות דעת לביטוח לאומי', description: 'חוות דעת רפואית לוועדה של המל״ל', icon: 'building', base_type: 'nii', price: 2500, active: true, sort: 3 },
  { id: 's4', label: 'חוות דעת משפטית', description: 'חוות דעת מומחה לבית משפט', icon: 'scale', base_type: 'legal', price: 10000, active: true, sort: 4 },
  { id: 's5', label: 'חוות דעת לחברת ביטוח', description: 'ביטוח פרטי, תאונות אישיות', icon: 'shield', base_type: 'legal', price: 4500, active: true, sort: 5 },
];

export default async function PreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  if (process.env.PREVIEW !== '1') notFound();
  const { screen } = await params;
  const clinic = fx.settings.lh_name;
  const firmShell = (active: string, body: React.ReactNode) => <AppShell role="firm" userName="עו״ד דנה לוי" orgName={fx.firms[0].name} clinicName={clinic} active={active}>{body}</AppShell>;
  const staffShell = (active: string, body: React.ReactNode) => <AppShell role="admin" userName="אלי" clinicName={clinic} active={active}>{body}</AppShell>;
  const c = fx.caseDetail;
  const paid = fx.payments.reduce((s, p) => s + p.amount, 0);

  switch (screen) {
    case 'login':
      return <AuthFrame><div className="panel"><div><h1>כניסה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>הזינו את פרטי הכניסה שקיבלתם מהמרפאה</p></div><LoginForm /></div></AuthFrame>;
    case 'firm-home':
      return firmShell('/firm', <FirmDashboardView firmName={fx.firms[0].name} clinicName={clinic} rows={fx.firmRows} />);
    case 'firm-book':
      return firmShell('/firm/book', <SlotBooking firmId="f1" slots={availableSlots(fx.settings, fx.rows.map((r) => ({ starts_at: r.starts_at, ends_at: new Date(new Date(r.starts_at).getTime() + 1800000).toISOString() })))} horizon={30} clinicName={clinic} needsApproval preview />);
    case 'firm-details':
      return firmShell('/firm/book', <DetailsWizard firmId="f1" services={SVC} preview
        docs={[{ id: 'd1', file_name: 'כתב תביעה - ישראלי.pdf', size_bytes: 1800000, created_at: fx.rows[0].starts_at }, { id: 'd2', file_name: 'MRI עמוד שדרה צווארי.pdf', size_bytes: 2400000, created_at: fx.rows[0].starts_at }]}
        c={{ id: 'x', caseNo: 1060, startsAt: fx.rows[0].starts_at, status: 'pending', type: 'legal', serviceId: 's4', name: 'ישראל ישראלי', idNumber: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', payer: 'referrer',
          notes: 'מבקשים חוות דעת לבית משפט בעניין נכות בעמוד שדרה צווארי לאחר תאונת עבודה, כולל קשר סיבתי.\nהאירוע: נפילה מסולם (2025-03)', submittedBy: 'עו״ד דנה לוי', detailsAt: null,
          extract: { name: 'ישראל ישראלי', id_number: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', suggested_type: 'legal', request: '', event: '', event_date: '', sure: [], warning: '' } }} />);
    case 'firm-cases':
      return firmShell('/firm/cases', <FirmCasesView rows={fx.firmRows} filter="all" />);
    case 'firm-cases-open': {
      const done = fx.firmRows.find((r) => r.status === 'done') ?? fx.firmRows[0];
      const rows = [...fx.firmRows, { ...done, id: done.id + 'x', case_no: done.case_no + 100, status: 'booked' as const }];
      return firmShell('/firm/cases', <FirmCasesView rows={rows} filter="all" open={done.id} gate={false} />);
    }
    case 'firm-case':
      return firmShell('/firm/cases', <FirmCaseView c={c} notes={fx.notes} docs={fx.docs} payments={fx.payments} paid={paid}
        letter={{ ready: false, awaitingPayment: false, finalizedAt: null }} actions={<CaseActions appointmentId={c.id} firmId="f1" canAdd canCancel />} />);
    case 'doctor-home':
      return staffShell('/doctor', <DoctorAgendaView mode="week" calendar={<CalendarView embedded base="/doctor" view="week" date={todayIL()} settings={fx.settings} blocks={fx.blocks} rows={fx.rows.map((r) => ({ ...r, ends_at: new Date(new Date(r.starts_at).getTime() + 1800000).toISOString() }))} tools={<BlockForm today={todayIL()} />} slotAction={(iso, l) => <FreeSlot iso={iso} label={l} minutes={30} />} blockAction={(b) => <RemoveBlock id={b.id} />} />} rows={fx.rows} past={false} isAdmin name="ד״ר חנוך" openRequests={1} share={<ShareLink path="/book" compact title="קישור לקביעת תור למפנים ולמטופלים" />}
        intake={Object.fromEntries(fx.rows.map((r, i) => [r.id, { status: i % 5 === 4 ? 'running' : 'done', readiness: [92, 72, 45, 88][i % 4], flags: i % 3, missing: i % 4 }]))}
        approvals={(id) => <ApprovalButtons id={id} compact preview />} />);
    case 'doctor-case':
      return staffShell('/doctor', <DoctorCaseView c={{ ...c, patient_email: 'israel@example.com' }} notes={fx.notes} docs={fx.docs} cancel={<DoctorCancel appointmentId={c.id} />}
        intake={<IntakePanel appointmentId={c.id} intake={fx.intake} docCount={fx.docs.length} requestedType={c.referral_type} cancelled={false} preview />}
        comms={<CommsPanel appointmentId={c.id} status={c.status} info={{ caseNo: c.case_no, startsAt: c.starts_at, minutes: 30, type: c.referral_type, patientName: c.patient_name, firmName: c.firm.name }}
          clinic={{ name: fx.settings.lh_name, address: fx.settings.lh_address, phone: fx.settings.lh_phone, bring: fx.settings.bring_items, note: '' }}
          patient={{ phone: c.patient_phone, email: 'israel@example.com' }} firm={{ phone: c.firm.phone, name: c.firm.name }} letterFinal={false} letterSentAt={null} emails={fx.emails} mailOn preview />}
        resolve={() => <button type="button" className="btn btn-sm btn-ghost">סימון כטופל</button>}
        payment={<PaymentPanel appointmentId={c.id} price={c.price} payer={c.payer} paid={paid} payments={fx.payments} morning payerName={payerName(c)} preview />}
        letter={<LetterEditor appointmentId={c.id} defaultType={c.referral_type} initial={fx.letter} docCount={fx.docs.length} cancelled={false} preview paper={{ ...fx.settings, patient: { name: c.patient_name, idNumber: c.patient_id_number, dob: c.patient_dob } }} />} />);
    case 'doctor-pending': {
      const pc = { ...c, status: 'pending' as const, patient_email: '' };
      return staffShell('/doctor', <DoctorCaseView c={pc} notes={[]} docs={fx.docs} approval={<ApprovalButtons id={c.id} preview />}
        intake={<IntakePanel appointmentId={c.id} intake={{ ...fx.intake, status: 'running', data: null }} docCount={fx.docs.length} requestedType={c.referral_type} cancelled={false} preview />}
        letter={<LetterEditor appointmentId={c.id} defaultType={c.referral_type} initial={null} docCount={fx.docs.length} cancelled={false} preview paper={{ ...fx.settings, patient: { name: c.patient_name, idNumber: c.patient_id_number, dob: c.patient_dob } }} />} />);
    }
    case 'doctor-calendar':
    case 'doctor-day':
    case 'doctor-month': {
      const view = screen === 'doctor-month' ? 'month' : screen === 'doctor-day' ? 'day' : 'week';
      return staffShell('/doctor/calendar', <CalendarView view={view} date={todayIL()} settings={fx.settings} blocks={fx.blocks}
        rows={fx.rows.map((r) => ({ ...r, ends_at: new Date(new Date(r.starts_at).getTime() + 1800000).toISOString() }))}
        tools={<div className="row"><BlockForm today={todayIL()} /></div>}
        slotAction={(iso, label) => <FreeSlot iso={iso} label={label} minutes={30} />} blockAction={(b) => <RemoveBlock id={b.id} />} />);
    }
    case 'admin-money': {
      const done = fx.rows.map((r, i) => ({ ...r, status: 'done' as const, payment_ok_at: i < 2 ? new Date().toISOString() : null }));
      return staffShell('/doctor/payments', <PendingPayView gate waiting={done.slice(2, 6)} approved={done.slice(0, 2)}
        pays={{ [done[3].id]: [{ amount: 900, method: 'bit', paid_on: todayIL() }], [done[0].id]: [{ amount: 2500, method: 'transfer', paid_on: todayIL() }] }}
        action={(r, undo) => <ApprovePay preview initialOpen={r.id === done[2].id} id={r.id} today={todayIL()} undo={undo} due={Math.max(0, r.price - r.paid)} paidInFull={r.price > 0 && r.paid >= r.price} />} />);
    }
    case 'admin-reports':
      return staffShell('/admin/reports', <ReportsView report={buildReport(fx.rows.map((r) => ({ id: r.id, case_no: r.case_no, starts_at: r.starts_at, status: r.status, referral_type: r.referral_type, price: r.price, payer: r.payer, firm_id: r.firm_name ?? '', firm_name: r.firm_name ?? '', patient_name: r.patient_name })),
        fx.rows.filter((r) => r.paid > 0).map((r) => ({ appointment_id: r.id, amount: r.paid, paid_on: todayIL(), method: 'transfer' })), [], todayIL())} />);
    case 'doctor-new':
      return staffShell('/doctor/new', <NewCaseForm firms={[{ id: 'p', name: 'פניות ישירות', kind: 'private' }, { id: 'f1', name: 'כהן, לוי ושות׳', kind: 'law' }]} services={SVC} preview
        initial={{ firm: 'p', name: '', id: '', dob: '', phone: '', email: '', what: 'letter', date: todayIL(), time: '10:30' }} />);
    case 'doctor-rx':
      return staffShell('/doctor', <div className="cols-side rx-tab">
        <div className="stack"><PrescriptionPanel appointmentId="x" patientEmail="" favorites={[]} rows={[]} past={[]} paper={{ settings: fx.settings, patient: { name: 'ישראל ישראלי', idNumber: '012345678', dob: '1980-05-12' } }}
          initialItems={[{ name: 'ARCOXIA 90 MG', reg: '1234', form: 'טבליות', strength: 'ETORICOXIB 90 MG', dose: '1 טבליה', frequency: 'פעם ביום', duration: '7 ימים', quantity: '1 אריזה' }, { name: 'MUSCOL', form: 'קפליות', strength: '', dose: '1 קפליה', frequency: '3 פעמים ביום', duration: '5 ימים', quantity: '1 אריזה', notes: 'אחרי האוכל' }, { name: 'משחת וולטרן אמולג׳ל', strength: '1%', form: 'ג׳ל', dose: 'מריחה דקה', frequency: '3 פעמים ביום', duration: '10 ימים', quantity: 'שפופרת 100 גר׳' }]} /></div>
        <div className="stack"><DiagnosesPanel appointmentId="x" suggestions={['פריצת דיסק צווארית', 'Cervical radiculopathy']}
          rows={[{ id: 1, code: 'M50.20', name: 'Other cervical disc displacement, unspecified cervical region', is_primary: true, note: '' }, { id: 2, code: 'M54.12', name: 'Radiculopathy, cervical region', is_primary: false, note: '' }]} /></div>
      </div>);
    case 'doctor-services':
      return staffShell('/doctor/services', <><PageHead title="סוגי שירות ומחירים" /><ServicesAdmin initial={SVC} preview /></>);
    case 'tpl-modal':
      return staffShell('/doctor', <TemplatePicker letterType="legal" onInsert={() => undefined} selection={() => ''} demo={fx.templates.map((t) => ({ id: t.id, title: t.title, body: t.body, letter_type: t.letter_type ?? null }))} />);
    case 'landing':
      return <Landing s={fx.settings} services={SVC} />;
    case 'landing-lawyers':
      return <Landing s={fx.settings} services={SVC} audience="lawyers" />;
    case 'landing-patients':
      return <Landing s={fx.settings} services={SVC} audience="patients" />;
    case 'register':
      return <AuthFrame><div className="panel"><div><h1>הרשמה למערכת</h1><p className="muted" style={{ marginTop: 4 }}>משרדי עורכי דין, מתווכים, חברות ומטופלים. החשבון נפתח אחרי אישור המרפאה.</p></div><RegisterForm /></div></AuthFrame>;
    case 'deposit':
      return <main className="pb"><section className="pb-card pb-done"><span className="pb-check"><Icon name="wallet" /></span><h1>נשאר רק להעביר מקדמה</h1><p className="pb-lead">המועד שמור עבורכם. כדי שהרופא יאשר את התור, העבירו את המקדמה והעלו צילום של אישור ההעברה.</p><DepositBox amount={300} title="מקדמה לשריון התור" pay={payLines(fx.settings)} holdHours={48} upload={async () => ({ ok: true })} /></section></main>;
    case 'signups':
      return staffShell('/admin/users', <><PageHead title="מפנים ומשתמשים" /><PendingSignups preview list={[
        { id: 'p1', name: 'כהן ושות׳ עורכי דין', kind: 'law', contact_name: 'עו״ד דנה כהן', phone: '03-5551234', email: 'dana@cohen-law.co.il', active: false, license_no: '45123', signup_note: 'כ־10 תיקי תאונות עבודה בחודש', created_at: new Date().toISOString() },
        { id: 'p2', name: 'ישראל ישראלי', kind: 'patient', contact_name: 'ישראל ישראלי', phone: '050-1234567', email: 'israel@gmail.com', active: false, signup_note: 'ת.ז. 012345678', created_at: new Date().toISOString() },
      ]} /></>);
    case 'public-book':
    case 'public-book-2':
    case 'public-book-3':
    case 'public-book-scan':
    case 'public-book-4': {
      const demo = screen === 'public-book-2' ? { step: 2 } : screen === 'public-book-3' ? { step: 3 } : screen === 'public-book-scan' ? { step: 3, scanning: true } : screen === 'public-book-4' ? { step: 4, ext: {
        name: 'ישראל ישראלי', id_number: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', suggested_type: 'legal' as const,
        request: 'חוות דעת לבית משפט לגבי נכות בעמוד שדרה צווארי לאחר תאונת עבודה.', event: 'תאונת עבודה', event_date: '2025-03', sure: ['name', 'id_number', 'dob', 'phone'], warning: '',
        referrer_kind: 'law' as const, referrer_office: 'כהן ושות׳ משרד עורכי דין', referrer_contact: 'עו״ד דנה כהן', referrer_email: 'dana@cohen-law.co.il', referrer_phone: '03-5551234',
      } } : undefined;
      return <PublicBooking open clinic={{ name: clinic, address: 'מגדל ספיר, רחוב תובל 40, רמת גן', phone: '052-4266440', needsApproval: true }} services={SVC} code="" firm={null} demo={demo}
        slots={availableSlots(fx.settings, fx.rows.map((r) => ({ starts_at: r.starts_at, ends_at: new Date(new Date(r.starts_at).getTime() + 1800000).toISOString() })))} />;
    }
    case 'doctor-templates':
      return staffShell('/doctor/templates', <><PageHead title="תבניות למכתבים" /><TemplatesAdmin list={fx.templates} preview /></>);
    case 'firm-resched':
      return firmShell('/firm/cases', <RescheduleRequest appointmentId={c.id} firmId="f1" preview last={null}
        slots={availableSlots(fx.settings, [])} />);
    case 'admin-payments':
      return staffShell('/admin/payments', <PaymentsView rows={fx.rows} filter="open" q="" collectedThisMonth={27400} />);
    case 'admin-users':
      return staffShell('/admin/users', <><PageHead title="מפנים ומשתמשים" sub="רק מי שמופיע כאן יכול להיכנס. כל מפנה רואה רק את התיקים שלו." /><UsersAdmin firms={fx.firms} users={fx.users} me="u0" preview services={SVC.map((x) => ({ id: x.id, label: x.label, price: Number(x.price), active: true }))} prices={{ [fx.firms[0].id]: { [SVC[1].id]: 2000 } }} /></>);
    case 'admin-settings':
      return staffShell('/admin', <><PageHead title="הגדרות" sub="זמני קבלה, מחירים, נייר מכתבים ואבטחה" /><SettingsForm initial={fx.settings} morning mail cron preview /></>);
    case 'letter':
      return <LetterPaper settings={fx.settings} letter={{ ...fx.letter, letter_date: todayIL() }} patient={{ name: c.patient_name, idNumber: c.patient_id_number, dob: c.patient_dob }} backHref={`/doctor/cases/${c.id}`} draft printButton={<PrintButton />} />;
    case 'admin-log':
      return staffShell('/admin/log', <LogView rows={fx.log} />);
    default:
      notFound();
  }
}
