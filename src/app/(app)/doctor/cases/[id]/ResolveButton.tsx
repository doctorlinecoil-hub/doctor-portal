'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { resolveRequest } from '../../actions';

export default function ResolveButton({ noteId, caseId }: { noteId: string; caseId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
      onClick={() => start(async () => { await resolveRequest(noteId, caseId); router.refresh(); })}>
      <Icon name="check" />{busy ? '…' : 'סימון כטופל'}
    </button>
  );
}
