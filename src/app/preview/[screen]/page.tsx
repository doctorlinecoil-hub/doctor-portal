import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import AuthFrame from '@/components/AuthFrame';
import LoginForm from '@/app/login/LoginForm';
import SlotBooking from '@/app/(app)/firm/book/SlotBooking';
import DetailsWizard from '@/app/(app)/firm/cases/[id]/details/DetailsWizard';
import NewCaseForm from '@/app/(app)/doctor/new/NewCaseForm';
import DiagnosesPanel from '@/app/(app)/doctor/cases/[id]/DiagnosesPanel';
import PrescriptionPanel from '@/app/(app)/doctor/cases/[id]/PrescriptionPanel';
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

export const dynamic = 'force-dynamic';

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
      return firmShell('/firm/book', <DetailsWizard firmId="f1" prices={fx.settings.prices} preview
        docs={[{ id: 'd1', file_name: 'כתב תביעה - ישראלי.pdf', size_bytes: 1800000, created_at: fx.rows[0].starts_at }, { id: 'd2', file_name: 'MRI עמוד שדרה צווארי.pdf', size_bytes: 2400000, created_at: fx.rows[0].starts_at }]}
        c={{ id: 'x', caseNo: 1060, startsAt: fx.rows[0].starts_at, status: 'pending', type: 'legal', name: 'ישראל ישראלי', idNumber: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', payer: 'referrer',
          notes: 'מבקשים חוות דעת לבית משפט בעניין נכות בעמוד שדרה צווארי לאחר תאונת עבודה, כולל קשר סיבתי.\nהאירוע: נפילה מסולם (2025-03)', submittedBy: 'עו״ד דנה לוי', detailsAt: null,
          extract: { name: 'ישראל ישראלי', id_number: '012345678', dob: '1980-05-12', phone: '050-1234567', email: '', suggested_type: 'legal', request: '', event: '', event_date: '', sure: [], warning: '' } }} />);
    case 'firm-cases':
      return firmShell('/firm/cases', <FirmCasesView rows={fx.firmRows} filter="all" />);
    case 'firm-case':
      return firmShell('/firm/cases', <FirmCaseView c={c} notes={fx.notes} docs={fx.docs} payments={fx.payments} paid={paid}
        letter={{ ready: false, awaitingPayment: false, finalizedAt: null }} actions={<CaseActions appointmentId={c.id} firmId="f1" canAdd canCancel />} />);
    case 'doctor-home':
      return staffShell('/doctor', <DoctorAgendaView rows={fx.rows} past={false} isAdmin name="ד״ר חנוך" openRequests={1}
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
    case 'doctor-month': {
      const view = screen === 'doctor-month' ? 'month' : 'week';
      return staffShell('/doctor/calendar', <CalendarView view={view} date={todayIL()} settings={fx.settings} blocks={fx.blocks}
        rows={fx.rows.map((r) => ({ ...r, ends_at: new Date(new Date(r.starts_at).getTime() + 1800000).toISOString() }))}
        tools={<div className="row"><BlockForm today={todayIL()} /></div>}
        slotAction={(iso, label) => <FreeSlot iso={iso} label={label} minutes={30} />} blockAction={(b) => <RemoveBlock id={b.id} />} />);
    }
    case 'admin-reports':
      return staffShell('/admin/reports', <ReportsView report={buildReport(fx.rows.map((r) => ({ id: r.id, case_no: r.case_no, starts_at: r.starts_at, status: r.status, referral_type: r.referral_type, price: r.price, payer: r.payer, firm_id: r.firm_name ?? '', firm_name: r.firm_name ?? '', patient_name: r.patient_name })),
        fx.rows.filter((r) => r.paid > 0).map((r) => ({ appointment_id: r.id, amount: r.paid, paid_on: todayIL(), method: 'transfer' })), [], todayIL())} />);
    case 'doctor-new':
      return staffShell('/doctor/new', <NewCaseForm firms={[{ id: 'p', name: 'פניות ישירות', kind: 'private' }, { id: 'f1', name: 'כהן, לוי ושות׳', kind: 'law' }]} prices={fx.settings.prices} preview
        initial={{ firm: 'p', name: '', id: '', dob: '', phone: '', email: '', what: 'letter', date: todayIL(), time: '10:30' }} />);
    case 'doctor-rx':
      return staffShell('/doctor', <div className="cols case-cols">
        <div className="stack"><DiagnosesPanel appointmentId="x" suggestions={['פריצת דיסק צווארית', 'Cervical radiculopathy']}
          rows={[{ id: 1, code: 'M50.20', name: 'Other cervical disc displacement, unspecified cervical region', is_primary: true, note: '' }, { id: 2, code: 'M54.12', name: 'Radiculopathy, cervical region', is_primary: false, note: '' }]} /></div>
        <div className="stack"><PrescriptionPanel appointmentId="x" patientEmail="israel@example.com"
          favorites={[{ id: 1, name: 'ARCOXIA 90 MG', reg_number: '', form: 'טבליות', strength: 'ETORICOXIB 90 MG', dose: '1 טבליה', frequency: 'פעם ביום', duration: '7 ימים', quantity: '1 אריזה', notes: '' }, { id: 2, name: 'אקמול', reg_number: '', form: '', strength: '', dose: '500 מ״ג', frequency: 'לפי הצורך', duration: '', quantity: '', notes: '' }]}
          rows={[{ id: 'r1', appointment_id: 'x', items: [{ name: 'ARCOXIA 90 MG', form: 'טבליות', strength: 'ETORICOXIB 90 MG', dose: '1 טבליה', frequency: 'פעם ביום', duration: '7 ימים', quantity: '1 אריזה' }, { name: 'MUSCOL', dose: '1 קפליה', frequency: '3 פעמים ביום', duration: '5 ימים', quantity: '1 אריזה' }], notes: '', rx_date: todayIL(), created_at: new Date().toISOString(), sent_at: null }]}
          past={[]} /></div>
      </div>);
    case 'doctor-templates':
      return staffShell('/doctor/templates', <><PageHead title="תבניות למכתבים" /><TemplatesAdmin list={fx.templates} preview /></>);
    case 'firm-resched':
      return firmShell('/firm/cases', <RescheduleRequest appointmentId={c.id} firmId="f1" preview last={null}
        slots={availableSlots(fx.settings, [])} />);
    case 'admin-payments':
      return staffShell('/admin/payments', <PaymentsView rows={fx.rows} filter="open" q="" collectedThisMonth={27400} />);
    case 'admin-users':
      return staffShell('/admin/users', <><PageHead title="מפנים ומשתמשים" sub="רק מי שמופיע כאן יכול להיכנס. כל מפנה רואה רק את התיקים שלו." /><UsersAdmin firms={fx.firms} users={fx.users} me="u0" preview /></>);
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
