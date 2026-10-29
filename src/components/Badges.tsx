import { typeOf, KIND, PAY_STATE, STATUS_FIRM, STATUS_STAFF, type ApptStatus, type PayState, type ReferralType, type ReferrerKind } from '@/lib/constants';

export function TypeBadge({ type }: { type: ReferralType }) {
  return <span className="badge b-type">{typeOf(type)?.label}</span>;
}

export function StatusBadge({ status, staff }: { status: ApptStatus; staff?: boolean }) {
  return <span className={`badge b-${status}`}>{(staff ? STATUS_STAFF : STATUS_FIRM)[status]}</span>;
}

export function PayBadge({ state }: { state: PayState }) {
  return <span className={`badge b-${state}`}>{PAY_STATE[state]}</span>;
}

export function KindBadge({ kind }: { kind: ReferrerKind }) {
  return <span className={`badge ${kind === 'broker' ? 'b-broker' : kind === 'private' ? 'b-pending' : 'b-type'}`}>{KIND[kind]}</span>;
}
